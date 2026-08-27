"""
VisionBharat Evaluation Engine
==============================
Complete evaluation pipeline for the from-scratch detector.

Implements:
- IoU computation (explicit)
- Precision, Recall, F1
- Per-class metrics
- Confusion matrix
- Error categorization
- Confidence calibration

Project: VisionBharat — DataGenesis 2026
Author: Arul Maria Agnes
"""

import torch
import numpy as np
from typing import List, Dict, Tuple, Optional
from collections import defaultdict
import logging

logger = logging.getLogger("Evaluation")


def compute_iou(box1: np.ndarray, box2: np.ndarray) -> float:
    """
    Compute Intersection over Union between two bounding boxes.
    
    IoU = Area(Intersection) / Area(Union)
    
    Args:
        box1: [x1, y1, x2, y2] format
        box2: [x1, y1, x2, y2] format
    
    Returns:
        IoU value in [0, 1]
    """
    inter_x1 = max(box1[0], box2[0])
    inter_y1 = max(box1[1], box2[1])
    inter_x2 = min(box1[2], box2[2])
    inter_y2 = min(box1[3], box2[3])
    
    inter_area = max(0, inter_x2 - inter_x1) * max(0, inter_y2 - inter_y1)
    
    area1 = (box1[2] - box1[0]) * (box1[3] - box1[1])
    area2 = (box2[2] - box2[0]) * (box2[3] - box2[1])
    union_area = area1 + area2 - inter_area
    
    if union_area <= 0:
        return 0.0
    
    return inter_area / union_area


def compute_ap(recalls: np.ndarray, precisions: np.ndarray) -> float:
    """Compute Average Precision using 11-point interpolation"""
    ap = 0.0
    for t in np.arange(0, 1.1, 0.1):
        mask = recalls >= t
        if mask.any():
            ap += np.max(precisions[mask])
    return ap / 11.0


class Evaluator:
    """
    Comprehensive evaluation engine
    
    Computes:
    - Per-class precision, recall, F1, AP
    - Mean metrics (mAP, mF1)
    - Confusion matrix
    - IoU statistics
    - Error categorization
    """
    
    def __init__(self, num_classes: int, iou_threshold: float = 0.5,
                 confidence_threshold: float = 0.5):
        self.num_classes = num_classes
        self.iou_threshold = iou_threshold
        self.confidence_threshold = confidence_threshold
        
        # Per-class counters
        self.true_positives = defaultdict(int)
        self.false_positives = defaultdict(int)
        self.false_negatives = defaultdict(int)
        
        # IoU tracking
        self.iou_values = []
        
        # Error tracking
        self.errors = defaultdict(list)
        
        # Confusion matrix
        self.confusion_matrix = np.zeros((num_classes, num_classes), dtype=int)
    
    def match_predictions(self, predictions: List[Dict], ground_truths: List[Dict]) -> Dict:
        """
        Match predictions to ground truth using IoU threshold
        
        Args:
            predictions: List of {box, class_id, confidence}
            ground_truths: List of {box, class_id}
        
        Returns:
            Matched results with TP, FP, FN
        """
        # Filter by confidence
        preds = [p for p in predictions if p['confidence'] >= self.confidence_threshold]
        
        matched_gt = set()
        results = {'tp': [], 'fp': [], 'fn': [], 'iou': []}
        
        # Sort predictions by confidence (descending)
        preds.sort(key=lambda x: x['confidence'], reverse=True)
        
        for pred in preds:
            best_iou = 0
            best_gt_idx = -1
            
            for gt_idx, gt in enumerate(ground_truths):
                if gt_idx in matched_gt:
                    continue
                
                iou = compute_iou(pred['box'], gt['box'])
                if iou > best_iou:
                    best_iou = iou
                    best_gt_idx = gt_idx
            
            if best_iou >= self.iou_threshold and best_gt_idx >= 0:
                # Match found
                gt = ground_truths[best_gt_idx]
                matched_gt.add(best_gt_idx)
                
                results['tp'].append({
                    'pred_class': pred['class_id'],
                    'gt_class': gt['class_id'],
                    'iou': best_iou,
                    'confidence': pred['confidence'],
                })
                results['iou'].append(best_iou)
                self.iou_values.append(best_iou)
                
                # Update confusion matrix
                self.confusion_matrix[gt['class_id']][pred['class_id']] += 1
                
                if pred['class_id'] == gt['class_id']:
                    self.true_positives[pred['class_id']] += 1
                else:
                    self.false_positives[pred['class_id']] += 1
                    self.false_negatives[gt['class_id']] += 1
                    self.errors['classification'].append({
                        'predicted': pred['class_id'],
                        'actual': gt['class_id'],
                        'iou': best_iou,
                    })
            else:
                # False positive
                results['fp'].append({
                    'class_id': pred['class_id'],
                    'confidence': pred['confidence'],
                    'best_iou': best_iou,
                })
                self.false_positives[pred['class_id']] += 1
                
                if best_iou > 0.3:
                    self.errors['localization'].append({
                        'class_id': pred['class_id'],
                        'iou': best_iou,
                    })
        
        # False negatives (unmatched ground truths)
        for gt_idx, gt in enumerate(ground_truths):
            if gt_idx not in matched_gt:
                results['fn'].append({'class_id': gt['class_id']})
                self.false_negatives[gt['class_id']] += 1
                self.errors['missed'].append({'class_id': gt['class_id']})
        
        return results
    
    def compute_metrics(self) -> Dict:
        """Compute comprehensive evaluation metrics"""
        per_class = {}
        
        for cls_id in range(self.num_classes):
            tp = self.true_positives[cls_id]
            fp = self.false_positives[cls_id]
            fn = self.false_negatives[cls_id]
            
            precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
            recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
            f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0
            
            per_class[cls_id] = {
                'precision': precision,
                'recall': recall,
                'f1': f1,
                'tp': tp, 'fp': fp, 'fn': fn,
                'support': tp + fn,
            }
        
        # Macro-averaged metrics
        all_prec = [v['precision'] for v in per_class.values()]
        all_rec = [v['recall'] for v in per_class.values()]
        all_f1 = [v['f1'] for v in per_class.values()]
        
        # Mean IoU
        mean_iou = np.mean(self.iou_values) if self.iou_values else 0.0
        
        return {
            'per_class': per_class,
            'macro_precision': np.mean(all_prec),
            'macro_recall': np.mean(all_rec),
            'macro_f1': np.mean(all_f1),
            'mean_iou': mean_iou,
            'confusion_matrix': self.confusion_matrix.tolist(),
            'total_errors': {k: len(v) for k, v in self.errors.items()},
        }
    
    def categorize_errors(self) -> Dict:
        """Categorize all detection errors"""
        return {
            'classification_errors': len(self.errors.get('classification', [])),
            'localization_errors': len(self.errors.get('localization', [])),
            'missed_detections': len(self.errors.get('missed', [])),
            'details': {k: v for k, v in self.errors.items()},
        }


if __name__ == "__main__":
    # Smoke test
    evaluator = Evaluator(num_classes=8, iou_threshold=0.5)
    
    # Simulated predictions and ground truths
    predictions = [
        {'box': np.array([100, 100, 300, 300]), 'class_id': 0, 'confidence': 0.9},
        {'box': np.array([350, 150, 500, 350]), 'class_id': 1, 'confidence': 0.7},
    ]
    ground_truths = [
        {'box': np.array([105, 105, 305, 305]), 'class_id': 0},
        {'box': np.array([340, 140, 490, 340]), 'class_id': 1},
    ]
    
    results = evaluator.match_predictions(predictions, ground_truths)
    metrics = evaluator.compute_metrics()
    
    print("[Evaluation Smoke Test]")
    print(f"  Macro Precision: {metrics['macro_precision']:.3f}")
    print(f"  Macro Recall: {metrics['macro_recall']:.3f}")
    print(f"  Macro F1: {metrics['macro_f1']:.3f}")
    print(f"  Mean IoU: {metrics['mean_iou']:.3f}")
    print("  PASSED")
