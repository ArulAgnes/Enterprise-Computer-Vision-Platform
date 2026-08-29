"""
VisionBharat Inference Pipeline
================================
Run inference on images using a trained VisionBharat model.

This module:
1. Loads a trained checkpoint
2. Preprocesses an input image
3. Runs forward pass through the model
4. Post-processes detections (NMS, thresholding)
5. Returns structured detection results

Project: VisionBharat — DataGenesis 2026
Author: Arul Maria Agnes
"""

import torch
import torch.nn.functional as F
import numpy as np
import cv2
import os
import json
import time
import logging
from pathlib import Path
from typing import List, Dict, Tuple, Optional

from model import VisionBharatDetector, create_visionbharat_model

logging.basicConfig(level=logging.INFO, format='[%(asctime)s][%(name)s] %(levelname)s: %(message)s')
logger = logging.getLogger("Inference")


def preprocess_image(image_path: str, image_size: int = 640) -> Tuple[torch.Tensor, int, int]:
    """
    Load and preprocess an image for inference.

    Args:
        image_path: Path to the image file
        image_size: Target input size (square)

    Returns:
        (tensor, original_width, original_height)
    """
    image = cv2.imread(image_path)
    if image is None:
        raise FileNotFoundError(f"Could not read image: {image_path}")

    orig_h, orig_w = image.shape[:2]
    image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    image_resized = cv2.resize(image_rgb, (image_size, image_size))
    image_normalized = image_resized.astype(np.float32) / 255.0
    tensor = torch.from_numpy(image_normalized).permute(2, 0, 1).unsqueeze(0)

    return tensor, orig_w, orig_h


def postprocess_detections(
    predictions: List[Tuple[torch.Tensor, torch.Tensor, torch.Tensor]],
    orig_w: int,
    orig_h: int,
    image_size: int = 640,
    num_classes: int = 8,
    confidence_threshold: float = 0.3,
    nms_threshold: float = 0.5,
    class_names: Optional[List[str]] = None,
) -> List[Dict]:
    """
    Post-process raw model output into final detections.

    Args:
        predictions: List of (obj, box, cls) tuples from detection heads
        orig_w: Original image width
        orig_h: Original image height
        image_size: Model input size
        num_classes: Number of classes
        confidence_threshold: Minimum confidence to keep
        nms_threshold: NMS IoU threshold
        class_names: Optional list of class names

    Returns:
        List of detection dicts with className, confidence, x, y, width, height
    """
    if class_names is None:
        class_names = [f"class_{i}" for i in range(num_classes)]

    all_detections = []

    for pred_obj, pred_box, pred_cls in predictions:
        B = pred_obj.shape[0]
        num_anchors = pred_obj.shape[1]
        H, W = pred_obj.shape[2], pred_obj.shape[3]

        pred_obj = pred_obj.reshape(B, num_anchors, H, W)
        pred_box = pred_box.reshape(B, num_anchors, 4, H, W)
        pred_cls = pred_cls.reshape(B, num_anchors, num_classes, H, W)

        obj_scores = torch.sigmoid(pred_obj[0])
        cls_scores = torch.sigmoid(pred_cls[0])

        for a in range(num_anchors):
            for gj in range(H):
                for gi in range(W):
                    obj_conf = obj_scores[a, gj, gi].item()
                    if obj_conf < confidence_threshold:
                        continue

                    cls_scores_anchors = cls_scores[a, :, gj, gi]
                    max_cls_conf, max_cls_idx = cls_scores_anchors.max(dim=0)
                    final_conf = obj_conf * max_cls_conf.item()

                    if final_conf < confidence_threshold:
                        continue

                    box_reg = pred_box[0, a, :, gj, gi]
                    cx = (gi + torch.sigmoid(box_reg[0]).item()) / W
                    cy = (gj + torch.sigmoid(box_reg[1]).item()) / H
                    bw = torch.exp(box_reg[2]).item() * 0.1 * (2 ** a)
                    bh = torch.exp(box_reg[3]).item() * 0.1 * (2 ** a)

                    x1 = max(0, (cx - bw / 2) * orig_w)
                    y1 = max(0, (cy - bh / 2) * orig_h)
                    w = min(bw * orig_w, orig_w - x1)
                    h = min(bh * orig_h, orig_h - y1)

                    if w > 0 and h > 0:
                        all_detections.append({
                            'className': class_names[max_cls_idx.item()],
                            'confidence': final_conf,
                            'x': x1,
                            'y': y1,
                            'width': w,
                            'height': h,
                        })

    all_detections.sort(key=lambda d: d['confidence'], reverse=True)

    kept = []
    for det in all_detections:
        is_duplicate = False
        for kept_det in kept:
            if det['className'] == kept_det['className']:
                ix1 = max(det['x'], kept_det['x'])
                iy1 = max(det['y'], kept_det['y'])
                ix2 = min(det['x'] + det['width'], kept_det['x'] + kept_det['width'])
                iy2 = min(det['y'] + det['height'], kept_det['y'] + kept_det['height'])
                inter = max(0, ix2 - ix1) * max(0, iy2 - iy1)
                area1 = det['width'] * det['height']
                area2 = kept_det['width'] * kept_det['height']
                iou = inter / (area1 + area2 - inter + 1e-7)
                if iou > nms_threshold:
                    is_duplicate = True
                    break
        if not is_duplicate:
            kept.append(det)

    return kept


def run_inference(
    image_path: str,
    checkpoint_path: str,
    num_classes: int = 8,
    image_size: int = 640,
    confidence_threshold: float = 0.3,
    class_names: Optional[List[str]] = None,
) -> Dict:
    """
    Run full inference pipeline on a single image.

    Args:
        image_path: Path to input image
        checkpoint_path: Path to model checkpoint (.pt file)
        num_classes: Number of object classes
        image_size: Model input size
        confidence_threshold: Detection confidence threshold
        class_names: Optional list of class names

    Returns:
        Dict with detections, timing, and image info
    """
    if class_names is None:
        class_names = [
            "clay_diya", "brass_diya", "hanging_diya", "multi_wick_diya",
            "kuthu_vilakku", "temple_bell", "incense_holder", "ritual_plate"
        ]

    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    logger.info(f"[Inference] Device: {device}")

    model = create_visionbharat_model(num_classes=num_classes, input_size=image_size)

    if checkpoint_path and os.path.exists(checkpoint_path):
        logger.info(f"[Inference] Loading checkpoint: {checkpoint_path}")
        checkpoint = torch.load(checkpoint_path, map_location=device, weights_only=False)
        if 'model_state_dict' in checkpoint:
            model.load_state_dict(checkpoint['model_state_dict'])
        else:
            model.load_state_dict(checkpoint)
        logger.info("[Inference] Checkpoint loaded successfully")
    else:
        logger.warning("[Inference] No checkpoint found. Using random weights.")

    model = model.to(device)
    model.eval()

    tensor, orig_w, orig_h = preprocess_image(image_path, image_size)
    tensor = tensor.to(device)

    start_time = time.time()
    with torch.no_grad():
        predictions = model(tensor)
    inference_time_ms = (time.time() - start_time) * 1000

    detections = postprocess_detections(
        predictions,
        orig_w, orig_h,
        image_size=image_size,
        num_classes=num_classes,
        confidence_threshold=confidence_threshold,
        class_names=class_names,
    )

    result = {
        'detections': detections,
        'numDetections': len(detections),
        'inferenceTimeMs': round(inference_time_ms, 2),
        'imageWidth': orig_w,
        'imageHeight': orig_h,
        'modelParameters': model.count_parameters(),
        'device': str(device),
    }

    logger.info(f"[Inference] {len(detections)} detections in {inference_time_ms:.1f}ms")
    return result


def main():
    import argparse

    parser = argparse.ArgumentParser(description="VisionBharat Inference")
    parser.add_argument("--image", type=str, required=True, help="Path to input image")
    parser.add_argument("--checkpoint", type=str, default="checkpoints/vb-cv-last.pt", help="Model checkpoint path")
    parser.add_argument("--num_classes", type=int, default=8)
    parser.add_argument("--image_size", type=int, default=640)
    parser.add_argument("--confidence", type=float, default=0.3, help="Confidence threshold")
    parser.add_argument("--output", type=str, default=None, help="Output JSON path")
    args = parser.parse_args()

    result = run_inference(
        image_path=args.image,
        checkpoint_path=args.checkpoint,
        num_classes=args.num_classes,
        image_size=args.image_size,
        confidence_threshold=args.confidence,
    )

    print(json.dumps(result, indent=2, default=str))

    if args.output:
        with open(args.output, 'w') as f:
            json.dump(result, f, indent=2, default=str)
        print(f"\nResults saved to {args.output}")


if __name__ == "__main__":
    main()
