"""
VisionBharat Training Pipeline
==============================
Complete training pipeline for the from-scratch CNN detector.

COMPETITION COMPLIANCE:
- Model is initialized RANDOMLY (no pretrained weights)
- Training uses ONLY team-collected dataset
- No transfer learning, no external data
- Deterministic seeds for reproducibility

Project: VisionBharat — DataGenesis 2026
Author: Arul Maria Agnes
"""

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
import numpy as np
import cv2
import os
import json
import time
import logging
import argparse
from pathlib import Path
from typing import Optional, Dict, Any, List

from model import VisionBharatDetector, DetectionLoss, create_visionbharat_model

logging.basicConfig(level=logging.INFO, format='[%(asctime)s][%(name)s] %(levelname)s: %(message)s')
logger = logging.getLogger("Training")


class DetectionDataset(Dataset):
    """Dataset class for loading images and annotations from filesystem"""
    
    def __init__(self, image_dir: str, label_dir: str, 
                 class_names: List[str], image_size: int = 640,
                 augmentation: Optional[Dict] = None):
        self.image_dir = Path(image_dir)
        self.label_dir = Path(label_dir)
        self.class_names = class_names
        self.num_classes = len(class_names)
        self.image_size = image_size
        self.augmentation = augmentation
        
        self.image_files = sorted([
            f for f in os.listdir(image_dir) 
            if f.lower().endswith(('.jpg', '.jpeg', '.png'))
        ])
        logger.info(f"[Dataset] Loaded {len(self.image_files)} images from {image_dir}")
    
    def __len__(self) -> int:
        return len(self.image_files)
    
    def __getitem__(self, idx: int) -> Dict[str, torch.Tensor]:
        img_path = self.image_dir / self.image_files[idx]
        label_path = self.label_dir / (Path(self.image_files[idx]).stem + '.txt')
        
        # Load image
        image = cv2.imread(str(img_path))
        image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        h, w = image.shape[:2]
        
        # Resize
        image = cv2.resize(image, (self.image_size, self.image_size))
        image = image.astype(np.float32) / 255.0
        image = torch.from_numpy(image).permute(2, 0, 1)  # CHW
        
        # Load annotations (YOLO format)
        boxes = []
        class_ids = []
        
        if label_path.exists():
            with open(label_path, 'r') as f:
                for line in f:
                    parts = line.strip().split()
                    if len(parts) >= 5:
                        cls_id = int(parts[0])
                        cx, cy, bw, bh = float(parts[1]), float(parts[2]), float(parts[3]), float(parts[4])
                        boxes.append([cx, cy, bw, bh])
                        class_ids.append(cls_id)
        
        targets = {
            'image': image,
            'boxes': torch.tensor(boxes, dtype=torch.float32) if boxes else torch.zeros((0, 4)),
            'class_ids': torch.tensor(class_ids, dtype=torch.long) if class_ids else torch.zeros((0,), dtype=torch.long),
            'image_path': str(img_path),
        }
        
        return targets


class AugmentationPipeline:
    """Custom augmentation with correct bounding box transformation"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
    
    def horizontal_flip(self, image: np.ndarray, boxes: np.ndarray) -> tuple:
        """Flip image horizontally and transform boxes"""
        flipped = image[:, ::-1, :]
        if len(boxes) > 0:
            boxes[:, 0] = 1.0 - boxes[:, 0]  # Flip cx
        return flipped, boxes
    
    def apply(self, image: np.ndarray, boxes: np.ndarray) -> tuple:
        """Apply augmentation pipeline"""
        if self.config.get('hflip', False) and np.random.random() < 0.5:
            image, boxes = self.horizontal_flip(image, boxes)
        return image, boxes


class Trainer:
    """
    Training engine for VisionBharat detector
    
    Features:
    - CPU and CUDA GPU support
    - Deterministic training with seeds
    - Checkpoint management (best + latest)
    - Per-epoch metric logging
    - Loss component tracking
    """
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        logger.info(f"[Trainer] Device: {self.device}")
        
        # Deterministic setup
        seed = config.get('seed', 42)
        torch.manual_seed(seed)
        np.random.seed(seed)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(seed)
        logger.info(f"[Trainer] Random seed: {seed}")
        
        # Create model FROM SCRATCH
        self.model = create_visionbharat_model(
            num_classes=config.get('num_classes', 8),
            input_size=config.get('image_size', 640)
        ).to(self.device)
        
        logger.info(f"[Trainer] Model parameters: {self.model.count_parameters():,}")
        logger.info(f"[Trainer] ⚠ ALL WEIGHTS INITIALIZED RANDOMLY — NO PRETRAINED WEIGHTS")
        
        # Loss function
        self.criterion = DetectionLoss(
            num_classes=config.get('num_classes', 8),
            box_weight=config.get('box_weight', 5.0),
            obj_weight=config.get('obj_weight', 1.0),
            cls_weight=config.get('cls_weight', 1.0),
            iou_threshold=config.get('iou_threshold', 0.5)
        )
        
        # Optimizer
        lr = config.get('learning_rate', 0.001)
        weight_decay = config.get('weight_decay', 0.0005)
        optimizer_name = config.get('optimizer', 'adam')
        
        if optimizer_name == 'adam':
            self.optimizer = optim.Adam(self.model.parameters(), lr=lr, weight_decay=weight_decay)
        elif optimizer_name == 'sgd':
            self.optimizer = optim.SGD(self.model.parameters(), lr=lr, momentum=0.9, weight_decay=weight_decay)
        else:
            raise ValueError(f"Unknown optimizer: {optimizer_name}")
        
        # Learning rate scheduler
        self.scheduler = optim.lr_scheduler.CosineAnnealingLR(
            self.optimizer, T_max=config.get('epochs', 100)
        )
        
        # Training state
        self.current_epoch = 0
        self.best_val_score = 0.0
        self.metrics_history = []
    
    def train_epoch(self, train_loader: DataLoader) -> Dict[str, float]:
        """Train for one epoch"""
        self.model.train()
        total_loss = 0
        total_box_loss = 0
        total_obj_loss = 0
        total_cls_loss = 0
        num_batches = 0
        
        for batch in train_loader:
            images = batch['image'].to(self.device)
            targets = [
                {'boxes': batch['boxes'][i].to(self.device),
                 'class_ids': batch['class_ids'][i].to(self.device)}
                for i in range(images.shape[0])
            ]
            
            self.optimizer.zero_grad()
            
            predictions = self.model(images)
            loss, box_l, obj_l, cls_l = self.criterion(predictions, targets)
            
            loss.backward()
            self.optimizer.step()
            
            total_loss += loss.item()
            total_box_loss += box_l.item()
            total_obj_loss += obj_l.item()
            total_cls_loss += cls_l.item()
            num_batches += 1
        
        avg_loss = total_loss / max(num_batches, 1)
        return {
            'train_loss': avg_loss,
            'box_loss': total_box_loss / max(num_batches, 1),
            'obj_loss': total_obj_loss / max(num_batches, 1),
            'cls_loss': total_cls_loss / max(num_batches, 1),
        }
    
    def validate(self, val_loader: DataLoader) -> Dict[str, float]:
        """Validate on validation set"""
        self.model.eval()
        total_loss = 0
        num_batches = 0
        
        with torch.no_grad():
            for batch in val_loader:
                images = batch['image'].to(self.device)
                targets = [
                    {'boxes': batch['boxes'][i].to(self.device),
                     'class_ids': batch['class_ids'][i].to(self.device)}
                    for i in range(images.shape[0])
                ]
                predictions = self.model(images)
                loss, _, _, _ = self.criterion(predictions, targets)
                total_loss += loss.item()
                num_batches += 1
        
        return {'val_loss': total_loss / max(num_batches, 1)}
    
    def save_checkpoint(self, path: str, is_best: bool = False):
        """Save model checkpoint"""
        checkpoint = {
            'epoch': self.current_epoch,
            'model_state_dict': self.model.state_dict(),
            'optimizer_state_dict': self.optimizer.state_dict(),
            'best_val_score': self.best_val_score,
            'config': self.config,
            'from_scratch': True,
            'pretrained': False,
        }
        torch.save(checkpoint, path)
        if is_best:
            best_path = str(Path(path).parent / (Path(path).stem + '-best.pt'))
            torch.save(checkpoint, best_path)
        logger.info(f"[Checkpoint] Saved to {path}" + (" (BEST)" if is_best else ""))
    
    def train(self, train_loader: DataLoader, val_loader: DataLoader,
              num_epochs: int, checkpoint_dir: str = "checkpoints"):
        """Full training loop"""
        os.makedirs(checkpoint_dir, exist_ok=True)
        start_time = time.time()
        
        logger.info(f"[Training] Starting training for {num_epochs} epochs")
        logger.info(f"[Training] ⚠ TRAINING FROM SCRATCH — NO PRETRAINED WEIGHTS")
        
        for epoch in range(num_epochs):
            self.current_epoch = epoch + 1
            epoch_start = time.time()
            
            # Train
            train_metrics = self.train_epoch(train_loader)
            
            # Validate
            val_metrics = self.validate(val_loader)
            
            # Update scheduler
            self.scheduler.step()
            
            # Combine metrics
            metrics = {
                **train_metrics,
                **val_metrics,
                'epoch': self.current_epoch,
                'lr': self.optimizer.param_groups[0]['lr'],
            }
            self.metrics_history.append(metrics)
            
            # Check for best model
            is_best = val_metrics['val_loss'] < self.best_val_score or self.current_epoch == 1
            if is_best:
                self.best_val_score = val_metrics['val_loss']
            
            # Save checkpoint
            if self.current_epoch % 10 == 0 or is_best:
                self.save_checkpoint(
                    os.path.join(checkpoint_dir, f"vb-cv-epoch{self.current_epoch}.pt"),
                    is_best=is_best
                )
            
            epoch_time = time.time() - epoch_start
            logger.info(
                f"[Epoch {self.current_epoch}/{num_epochs}] "
                f"Loss: {train_metrics['train_loss']:.4f} "
                f"Val: {val_metrics['val_loss']:.4f} "
                f"Time: {epoch_time:.1f}s"
            )
        
        total_time = time.time() - start_time
        logger.info(f"[Training] Completed in {total_time:.1f}s")
        
        # Save final checkpoint
        self.save_checkpoint(os.path.join(checkpoint_dir, "vb-cv-last.pt"))
        
        return self.metrics_history


def main():
    """Main training entry point with argument parsing"""
    parser = argparse.ArgumentParser(description="VisionBharat Training Pipeline")
    parser.add_argument("--dataset_root", type=str, required=True,
                        help="Root directory of dataset (should contain images/ and labels/ subdirs)")
    parser.add_argument("--num_classes", type=int, default=8)
    parser.add_argument("--image_size", type=int, default=640)
    parser.add_argument("--batch_size", type=int, default=16)
    parser.add_argument("--epochs", type=int, default=100)
    parser.add_argument("--learning_rate", type=float, default=0.001)
    parser.add_argument("--weight_decay", type=float, default=0.0005)
    parser.add_argument("--optimizer", type=str, default="adam", choices=["adam", "sgd"])
    parser.add_argument("--box_weight", type=float, default=5.0)
    parser.add_argument("--obj_weight", type=float, default=1.0)
    parser.add_argument("--cls_weight", type=float, default=1.0)
    parser.add_argument("--iou_threshold", type=float, default=0.5)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--checkpoint_dir", type=str, default="checkpoints")
    parser.add_argument("--class_names", type=str, nargs="+",
                        default=["diya", "lamp", "bell", "conch", "kalash", "flower", "incense", "vermillion"])
    args = parser.parse_args()

    config = {
        'num_classes': args.num_classes,
        'image_size': args.image_size,
        'batch_size': args.batch_size,
        'epochs': args.epochs,
        'learning_rate': args.learning_rate,
        'optimizer': args.optimizer,
        'weight_decay': args.weight_decay,
        'box_weight': args.box_weight,
        'obj_weight': args.obj_weight,
        'cls_weight': args.cls_weight,
        'iou_threshold': args.iou_threshold,
        'seed': args.seed,
    }

    logger.info(f"[VisionBharat] Training Configuration:")
    for k, v in config.items():
        logger.info(f"  {k}: {v}")
    logger.info(f"[VisionBharat] ⚠ TRAINING FROM SCRATCH — NO PRETRAINED WEIGHTS")

    dataset_root = Path(args.dataset_root)
    train_img_dir = dataset_root / "images" / "train"
    train_lbl_dir = dataset_root / "labels" / "train"
    val_img_dir = dataset_root / "images" / "val"
    val_lbl_dir = dataset_root / "labels" / "val"

    for d in [train_img_dir, train_lbl_dir, val_img_dir, val_lbl_dir]:
        if not d.exists():
            logger.error(f"[Dataset] Directory not found: {d}")
            raise FileNotFoundError(f"Dataset directory not found: {d}")

    train_dataset = DetectionDataset(
        image_dir=str(train_img_dir),
        label_dir=str(train_lbl_dir),
        class_names=args.class_names,
        image_size=args.image_size,
    )
    val_dataset = DetectionDataset(
        image_dir=str(val_img_dir),
        label_dir=str(val_lbl_dir),
        class_names=args.class_names,
        image_size=args.image_size,
    )

    train_loader = DataLoader(
        train_dataset,
        batch_size=args.batch_size,
        shuffle=True,
        num_workers=0,
        collate_fn=lambda batch: {
            'image': torch.stack([b['image'] for b in batch]),
            'boxes': [b['boxes'] for b in batch],
            'class_ids': [b['class_ids'] for b in batch],
        },
    )
    val_loader = DataLoader(
        val_dataset,
        batch_size=args.batch_size,
        shuffle=False,
        num_workers=0,
        collate_fn=lambda batch: {
            'image': torch.stack([b['image'] for b in batch]),
            'boxes': [b['boxes'] for b in batch],
            'class_ids': [b['class_ids'] for b in batch],
        },
    )

    logger.info(f"[Dataset] Train: {len(train_dataset)} images, Val: {len(val_dataset)} images")

    trainer = Trainer(config)

    try:
        trainer.train(
            train_loader=train_loader,
            val_loader=val_loader,
            num_epochs=args.epochs,
            checkpoint_dir=args.checkpoint_dir,
        )
    except KeyboardInterrupt:
        logger.info("[Training] Interrupted by user. Saving current state...")
        trainer.save_checkpoint(os.path.join(args.checkpoint_dir, "vb-cv-interrupted.pt"))
    except Exception as e:
        logger.error(f"[Training] Error: {e}")
        raise


if __name__ == "__main__":
    main()
