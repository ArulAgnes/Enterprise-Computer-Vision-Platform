"""
VisionBharat V2 — shared detection utilities (decode, NMS, IoU, mAP, errors)
=============================================================================
Every function here is implemented from first principles so the competition
audit can trace exactly how each metric is produced. No third-party detection
framework is used anywhere in VisionBharat.

All boxes are handled in **absolute pixel pascal_voc** format `[x1, y1, x2, y2]`
unless a function documents otherwise.

Project: VisionBharat — DataGenesis 2026
Author : Arul Maria Agnes
"""

from __future__ import annotations

import math
from typing import Dict, List, Optional, Sequence, Tuple

import numpy as np
import torch

try:  # torchvision is pinned in requirements but is only used for its NMS kernel
    from torchvision.ops import nms as _tv_nms

    TORCHVISION_NMS = True
except Exception:  # pragma: no cover
    _tv_nms = None  # type: ignore
    TORCHVISION_NMS = False


# ---------------------------------------------------------------------------
# Geometry
# ---------------------------------------------------------------------------


def iou_xyxy(box_a: Sequence[float], box_b: Sequence[float]) -> float:
    """Intersection-over-Union of two [x1, y1, x2, y2] boxes."""
    ax1, ay1, ax2, ay2 = float(box_a[0]), float(box_a[1]), float(box_a[2]), float(box_a[3])
    bx1, by1, bx2, by2 = float(box_b[0]), float(box_b[1]), float(box_b[2]), float(box_b[3])
    inter_w = max(0.0, min(ax2, bx2) - max(ax1, bx1))
    inter_h = max(0.0, min(ay2, by2) - max(ay1, by1))
    inter = inter_w * inter_h
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = area_a + area_b - inter
    return float(inter / union) if union > 0 else 0.0


def cxcywh_to_xyxy(boxes: torch.Tensor, scale: float = 1.0) -> torch.Tensor:
    """Convert normalised or pixel cxcywh tensors to xyxy."""
    x, y, w, h = boxes[:, 0] * scale, boxes[:, 1] * scale, boxes[:, 2] * scale, boxes[:, 3] * scale
    out = torch.stack([x - w / 2, y - h / 2, x + w / 2, y + h / 2], dim=1)
    return out


def xyxy_to_cxcywh(boxes: torch.Tensor) -> torch.Tensor:
    x1, y1, x2, y2 = boxes[:, 0], boxes[:, 1], boxes[:, 2], boxes[:, 3]
    return torch.stack([(x1 + x2) / 2, (y1 + y2) / 2, (x2 - x1), (y2 - y1)], dim=1)


# ---------------------------------------------------------------------------
# Decoding + NMS
# ---------------------------------------------------------------------------


def decode_predictions_per_image(
    outputs: Sequence[Tuple[torch.Tensor, torch.Tensor]],
    anchors: torch.Tensor,
    num_classes: int,
    conf_threshold: float = 0.25,
    img_size: int = 640,
    nms_iou: float = 0.45,
    anchor_base: int = 640,
) -> List[Tuple[np.ndarray, np.ndarray, np.ndarray]]:
    """Decode raw VisionBharat V2 head outputs into **per-image** detections.

    Args:
        outputs: list of (cls, reg) per level. cls: (B,A,C,H,W), reg: (B,A,5,H,W)
        anchors: (levels, A, 2) anchor sizes in pixels **at `anchor_base`** — they
            are rescaled to `img_size` here, exactly mirroring `DetectionLoss`
            (which rescales the same way when building regression targets).
        conf_threshold: minimum combined confidence (obj * max class prob)

    Returns:
        one tuple per image in the batch: (boxes (N,4) xyxy pixels, scores (N,), class_ids (N,))
    """
    with torch.no_grad():
        batch = outputs[0][0].shape[0]
        results: List[Tuple[np.ndarray, np.ndarray, np.ndarray]] = []

        for b in range(batch):
            boxes_b: List[np.ndarray] = []
            scores_b: List[np.ndarray] = []
            classes_b: List[np.ndarray] = []

            for level, (cls, reg) in enumerate(outputs):
                _, A, C, H, W = cls.shape
                stride_x = img_size / W
                stride_y = img_size / H
                # Anchors are authored for `anchor_base` (640) pixels; the loss
                # rescales them to the run's resolution, so decoding must too —
                # otherwise every box comes out (base/img_size)x too large.
                anchor_wh = anchors[level][:A] * (float(img_size) / float(anchor_base))  # (A,2)

                # offset = 2*sigmoid(t) - 0.5 — identical to DetectionLoss encoding
                tx = 2.0 * torch.sigmoid(reg[b, :, 0]) - 0.5        # (A,H,W)
                ty = 2.0 * torch.sigmoid(reg[b, :, 1]) - 0.5
                tw = reg[b, :, 2].clamp(-6, 6)
                th = reg[b, :, 3].clamp(-6, 6)
                obj = torch.sigmoid(reg[b, :, 4])
                cls_prob = torch.sigmoid(cls[b])        # (A,C,H,W)

                grid_y, grid_x = torch.meshgrid(
                    torch.arange(H, dtype=torch.float32),
                    torch.arange(W, dtype=torch.float32),
                    indexing="ij",
                )
                cx = (tx + grid_x.unsqueeze(0)) * stride_x
                cy = (ty + grid_y.unsqueeze(0)) * stride_y
                bw = torch.exp(tw) * anchor_wh[:, 0].view(A, 1, 1)
                bh = torch.exp(th) * anchor_wh[:, 1].view(A, 1, 1)

                x1 = (cx - bw / 2).reshape(-1)
                y1 = (cy - bh / 2).reshape(-1)
                x2 = (cx + bw / 2).reshape(-1)
                y2 = (cy + bh / 2).reshape(-1)

                obj_flat = obj.reshape(-1)
                cls_flat = cls_prob.permute(0, 2, 3, 1).reshape(-1, C)  # (A*H*W, C)
                best_score, best_cls = cls_flat.max(dim=1)
                conf = obj_flat * best_score

                keep = conf > conf_threshold
                if keep.any():
                    boxes_b.append(torch.stack([x1[keep], y1[keep], x2[keep], y2[keep]], dim=1).numpy())
                    scores_b.append(conf[keep].numpy())
                    classes_b.append(best_cls[keep].numpy())

            if boxes_b:
                boxes_np = np.concatenate(boxes_b, axis=0)
                scores_np = np.concatenate(scores_b, axis=0)
                classes_np = np.concatenate(classes_b, axis=0).astype(int)
                keep_idx = _nms_numpy(boxes_np, scores_np, classes_np, iou_threshold=nms_iou)
                results.append((boxes_np[keep_idx], scores_np[keep_idx], classes_np[keep_idx]))
            else:
                results.append(
                    (
                        np.zeros((0, 4), dtype=np.float32),
                        np.zeros((0,), dtype=np.float32),
                        np.zeros((0,), dtype=np.int64),
                    )
                )
        return results


def decode_predictions(
    outputs: Sequence[Tuple[torch.Tensor, torch.Tensor]],
    anchors: torch.Tensor,
    num_classes: int,
    conf_threshold: float = 0.25,
    img_size: int = 640,
    nms_iou: float = 0.45,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Single-image convenience wrapper around `decode_predictions_per_image`."""
    per_image = decode_predictions_per_image(outputs, anchors, num_classes, conf_threshold, img_size, nms_iou)
    if len(per_image) == 1:
        return per_image[0]
    boxes = np.concatenate([p[0] for p in per_image], axis=0) if per_image else np.zeros((0, 4), dtype=np.float32)
    scores = np.concatenate([p[1] for p in per_image], axis=0) if per_image else np.zeros((0,), dtype=np.float32)
    classes = np.concatenate([p[2] for p in per_image], axis=0) if per_image else np.zeros((0,), dtype=np.int64)
    return boxes, scores, classes


def _nms_numpy(boxes: np.ndarray, scores: np.ndarray, class_ids: np.ndarray, iou_threshold: float = 0.45) -> np.ndarray:
    """Class-wise non-maximum suppression, implemented from scratch in numpy."""
    keep_global: List[int] = []
    for cls in np.unique(class_ids):
        idx = np.where(class_ids == cls)[0]
        b = torch.from_numpy(boxes[idx]).float()
        s = torch.from_numpy(scores[idx]).float()
        if TORCHVISION_NMS:
            keep_local = _tv_nms(b, s, float(iou_threshold)).numpy()
        else:
            keep_local = _nms_manual(b, s, iou_threshold)
        keep_global.extend(idx[keep_local].tolist())
    keep_global.sort(key=lambda i: -float(scores[i]))
    return np.array(keep_global, dtype=int)


def _nms_manual(boxes: torch.Tensor, scores: torch.Tensor, iou_threshold: float) -> np.ndarray:
    order = scores.argsort(descending=True)
    keep: List[int] = []
    while order.numel() > 0:
        i = int(order[0].item())
        keep.append(i)
        if order.numel() == 1:
            break
        rest = order[1:]
        xx1 = torch.maximum(boxes[i, 0], boxes[rest, 0])
        yy1 = torch.maximum(boxes[i, 1], boxes[rest, 1])
        xx2 = torch.minimum(boxes[i, 2], boxes[rest, 2])
        yy2 = torch.minimum(boxes[i, 3], boxes[rest, 3])
        inter = (xx2 - xx1).clamp(min=0) * (yy2 - yy1).clamp(min=0)
        area_i = (boxes[i, 2] - boxes[i, 0]) * (boxes[i, 3] - boxes[i, 1])
        area_r = (boxes[rest, 2] - boxes[rest, 0]) * (boxes[rest, 3] - boxes[rest, 1])
        iou = inter / (area_i + area_r - inter + 1e-7)
        order = rest[iou <= iou_threshold]
    return np.array(keep, dtype=int)


# ---------------------------------------------------------------------------
# Matching + AP
# ---------------------------------------------------------------------------


def match_predictions(
    preds: List[Dict],
    gts: List[Dict],
    iou_threshold: float = 0.5,
) -> Dict[str, int]:
    """Greedy one-to-one matching (highest score first) exactly as COCO does.

    Each GT can be matched at most once; a prediction matches a GT when the IoU
    is >= `iou_threshold` **and** the class is identical (otherwise the
    prediction is a class-confusion false positive).

    Returns counters: tp, fp, fn, wrong_class, bad_localization, background_fp.
    """
    matched_gt = set()
    tp = fp = wrong_class = bad_localization = background_fp = 0

    for pred in sorted(preds, key=lambda p: -p["score"]):
        best_iou = 0.0
        best_gt = -1
        best_class_overlap_iou = 0.0
        for gi, gt in enumerate(gts):
            if gi in matched_gt:
                continue
            iou = iou_xyxy(pred["bbox"], gt["bbox"])
            if iou > best_class_overlap_iou and pred["class_id"] == gt["class_id"]:
                best_class_overlap_iou = iou
            if iou > best_iou:
                best_iou = iou
                best_gt = gi

        if best_gt == -1:
            fp += 1
            background_fp += 1
            continue

        gt = gts[best_gt]
        if best_iou >= iou_threshold and pred["class_id"] == gt["class_id"]:
            tp += 1
            matched_gt.add(best_gt)
        elif pred["class_id"] != gt["class_id"] and best_iou >= iou_threshold:
            wrong_class += 1
            fp += 1
        else:
            fp += 1
            if best_class_overlap_iou >= 0.3:
                bad_localization += 1
            else:
                background_fp += 1

    fn = len(gts) - len(matched_gt)
    return {
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "wrong_class": wrong_class,
        "bad_localization": bad_localization,
        "background_fp": background_fp,
        "matched_gt": len(matched_gt),
    }


def cap_detections(preds_by_image: Dict[str, List[Dict]], max_dets: int = 300) -> Dict[str, List[Dict]]:
    """Keep only the `max_dets` highest-scoring predictions per image.

    Mirrors the COCO evaluation protocol (maxDets=100..300). Besides being the
    standard, it keeps the greedy matcher fast when an under-trained model fires
    hundreds of thousands of low-confidence boxes.
    """
    if max_dets <= 0:
        return preds_by_image
    return {
        img_id: sorted(preds, key=lambda p: -p["score"])[:max_dets]
        for img_id, preds in preds_by_image.items()
    }


def average_precision(
    preds: List[Dict],
    gts: List[Dict],
    class_id: int,
    iou_threshold: float = 0.5,
) -> Tuple[float, float, float]:
    """11-point interpolated AP for one class (VOC-style), vectorised with numpy.

    Greedy one-to-one matching in descending confidence order:
      1. build the (n_preds x n_gts) IoU matrix in one shot
      2. walk predictions by score, assigning each to the best *unmatched* GT
      3. integrate the precision/recall curve at 11 recall points

    Returns (ap, precision_at_best_f1, recall_at_best_f1).
    """
    class_preds = sorted([p for p in preds if p["class_id"] == class_id], key=lambda p: -p["score"])
    class_gts = [g for g in gts if g["class_id"] == class_id]
    n_gt = len(class_gts)
    if n_gt == 0:
        return float("nan"), 0.0, 0.0
    if not class_preds:
        return 0.0, 0.0, 0.0

    pb = np.asarray([p["bbox"] for p in class_preds], dtype=np.float32)      # (n,4) x1y1x2y2
    gb = np.asarray([g["bbox"] for g in class_gts], dtype=np.float32)        # (m,4)

    ix1 = np.maximum(pb[:, None, 0], gb[None, :, 0])
    iy1 = np.maximum(pb[:, None, 1], gb[None, :, 1])
    ix2 = np.minimum(pb[:, None, 2], gb[None, :, 2])
    iy2 = np.minimum(pb[:, None, 3], gb[None, :, 3])
    inter = np.clip(ix2 - ix1, 0, None) * np.clip(iy2 - iy1, 0, None)
    area_p = np.clip(pb[:, 2] - pb[:, 0], 0, None) * np.clip(pb[:, 3] - pb[:, 1], 0, None)
    area_g = np.clip(gb[:, 2] - gb[:, 0], 0, None) * np.clip(gb[:, 3] - gb[:, 1], 0, None)
    iou = inter / (area_p[:, None] + area_g[None, :] - inter + 1e-7)          # (n,m)

    matched = np.zeros(n_gt, dtype=bool)
    tp_flags = np.zeros(len(class_preds), dtype=np.float32)
    for i in range(len(class_preds)):
        row = np.where(matched, -1.0, iou[i])
        j = int(np.argmax(row))
        if row[j] >= iou_threshold:
            matched[j] = True
            tp_flags[i] = 1.0

    tp_cum = np.cumsum(tp_flags)
    fp_cum = np.cumsum(1.0 - tp_flags)
    recalls = tp_cum / max(1, n_gt)
    precisions = tp_cum / np.maximum(tp_cum + fp_cum, 1e-7)

    ap = 0.0
    for t in np.arange(0.0, 1.0001, 0.1):
        mask = recalls >= t
        ap += float(precisions[mask].max()) if mask.any() else 0.0
    ap /= 11.0

    f1s = 2 * precisions * recalls / np.maximum(precisions + recalls, 1e-7)
    best = int(np.argmax(f1s))
    return float(ap), float(precisions[best]), float(recalls[best])


def mean_average_precision(
    preds_by_image: Dict[str, List[Dict]],
    gts_by_image: Dict[str, List[Dict]],
    class_ids: Sequence[int],
    iou_threshold: float = 0.5,
    max_dets: int = 300,
) -> Tuple[float, Dict[int, float]]:
    """mAP@iou for the given classes, plus the per-class AP dictionary."""
    capped = cap_detections(preds_by_image, max_dets)
    all_preds: List[Dict] = [p for preds in capped.values() for p in preds]
    all_gts: List[Dict] = [g for gts in gts_by_image.values() for g in gts]

    per_class: Dict[int, float] = {}
    for cid in class_ids:
        ap, _p, _r = average_precision(all_preds, all_gts, int(cid), iou_threshold)
        per_class[int(cid)] = 0.0 if (ap is None or math.isnan(ap)) else float(ap)
    valid = list(per_class.values())
    return (float(np.mean(valid)) if valid else 0.0), per_class


def quick_map50(
    preds_by_image: Dict[str, List[Dict]],
    gts_by_image: Dict[str, List[Dict]],
    num_classes: int,
) -> float:
    """Fast mAP@0.5 used during training for model selection."""
    mAP, _ = mean_average_precision(preds_by_image, gts_by_image, list(range(num_classes)), 0.5)
    return mAP
