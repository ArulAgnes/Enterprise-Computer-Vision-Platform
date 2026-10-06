"""
VisionBharat V2 — Annotation Accelerator (classical CV box proposals)
=====================================================================
Hand-annotating 10 photos is the last manual step in the pipeline, so the
platform offers a *proposal* pass that a human then accepts or adjusts.

The proposer is deliberately classical (no pretrained detector, competition
compliant) and works brilliantly for the Indian ritual-object photos this
project uses (centred bell / diya on a plain or softly blurred background):

  1. **Saliency by colour distance** — every pixel is scored by how far it is
     from the median colour of the image border (the background). This is the
     classic "centre-surround colour contrast" trick, computed in Lab space.
  2. **Otsu threshold + morphological close** — turns the saliency map into
     solid blobs; small specks are removed with an opening.
  3. **Largest contour -> bounding rectangle** with a 4% margin.
  4. **Fallback** — gradient-energy weighted centre box (60% of the shorter
     side), used when the image has no clear figure/ground separation.

Nothing here writes to the database: it emits proposals that
`POST /api/annotations/auto` stores as *editable* annotations, and the human
annotation studio can refine them.

CLI
---
    python ai/auto_annotate.py --images captured_photos --limit 10 --per-class 5 \\
        --json-out dataset/demo_annotations.json

Project: VisionBharat — DataGenesis 2026
Author : Arul Maria Agnes
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import sys
from typing import Any, Dict, List, Optional, Sequence, Tuple

import cv2
import numpy as np

IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp", ".bmp")


# ---------------------------------------------------------------------------
# Proposal core
# ---------------------------------------------------------------------------


def propose_box(image: np.ndarray) -> Tuple[List[int], float, str]:
    """Return ((x, y, w, h), confidence, method) for the most salient object.

    Saliency = 0.6 * Lab colour-distance-from-border + 0.4 * HSV saturation,
    multiplied by a centre-bias Gaussian (classic Itti/Koch centre-surround
    idea re-implemented from scratch). Brass bells and lit diyas are strongly
    chromatic, so the saturation term is what makes this work on the ritual
    objects even when the background is dark or textured.
    """
    h, w = image.shape[:2]
    area_img = float(h * w)
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB).astype(np.float32)
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV).astype(np.float32)

    # --- 1. Background estimate from the 6% border ring --------------------
    border = max(4, int(min(h, w) * 0.06))
    ring = np.concatenate(
        [
            lab[:border, :, :].reshape(-1, 3),
            lab[-border:, :, :].reshape(-1, 3),
            lab[:, :border, :].reshape(-1, 3),
            lab[:, -border:, :].reshape(-1, 3),
        ],
        axis=0,
    )
    bg = np.median(ring, axis=0)

    # --- 2. Combined colour-distance + saturation saliency -----------------
    dist = np.linalg.norm(lab - bg.reshape(1, 1, 3), axis=2)
    dist = cv2.normalize(dist, None, 0, 1, cv2.NORM_MINMAX)
    saturation = hsv[:, :, 1] / 255.0
    value = hsv[:, :, 2] / 255.0
    score_map = 0.55 * dist + 0.30 * saturation + 0.15 * value

    # --- 3. Centre bias (objects are centred in product-style photos) ------
    ys, xs = np.mgrid[0:h, 0:w]
    sigma = 0.42 * min(h, w)
    centre = np.exp(-(((xs - w / 2) ** 2 + (ys - h / 2) ** 2) / (2 * sigma ** 2)))
    score_map = score_map * (0.55 + 0.45 * centre)

    score_map = cv2.GaussianBlur(score_map.astype(np.float32), (0, 0), sigmaX=max(1.0, min(h, w) / 180.0))
    norm = cv2.normalize(score_map, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)

    _, mask = cv2.threshold(norm, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=3)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    candidates: List[Tuple[float, Tuple[int, int, int, int]]] = []
    for contour in contours:
        x, y, bw, bh = cv2.boundingRect(contour)
        area = float(bw * bh)
        coverage = area / area_img
        if coverage < 0.02 or coverage > 0.85:
            continue
        # Reject slivers that hug a full image edge (background bleed).
        touches = sum([x <= 1, y <= 1, x + bw >= w - 1, y + bh >= h - 1])
        if touches >= 3:
            continue
        cx, cy = x + bw / 2, y + bh / 2
        centre_penalty = 1.0 - 0.35 * (abs(cx - w / 2) / (w / 2) + abs(cy - h / 2) / (h / 2)) / 2
        aspect_penalty = min(bw, bh) / max(bw, bh)
        fill = area / max(1.0, float(cv2.contourArea(contour)))
        score = area * (centre_penalty ** 2) * (0.5 + 0.5 * aspect_penalty) * min(1.0, fill)
        candidates.append((score, (x, y, bw, bh)))

    if candidates:
        candidates.sort(key=lambda c: -c[0])
        x, y, bw, bh = candidates[0][1]
        margin_x, margin_y = int(bw * 0.04), int(bh * 0.04)
        x1 = max(0, x - margin_x)
        y1 = max(0, y - margin_y)
        x2 = min(w, x + bw + margin_x)
        y2 = min(h, y + bh + margin_y)
        coverage = ((x2 - x1) * (y2 - y1)) / area_img
        return [x1, y1, x2 - x1, y2 - y1], round(min(0.97, 0.5 + coverage), 3), "saliency_otsu"

    # --- 3. Fallback: gradient energy centre box ---------------------------
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    energy = np.abs(gx) + np.abs(gy)
    energy = cv2.GaussianBlur(energy, (0, 0), sigmaX=min(h, w) / 40.0)
    ys, xs = np.mgrid[0:h, 0:w]
    weights = energy / (energy.sum() + 1e-6)
    cx = float((weights * xs).sum())
    cy = float((weights * ys).sum())
    side = int(min(h, w) * 0.6)
    x1 = int(max(0, min(w - side, cx - side / 2)))
    y1 = int(max(0, min(h - side, cy - side / 2)))
    x2 = int(min(w, x1 + side))
    y2 = int(min(h, y1 + side))
    return [x1, y1, x2 - x1, y2 - y1], 0.45, "gradient_energy_centre"


# ---------------------------------------------------------------------------
# Batch driver
# ---------------------------------------------------------------------------


def find_images(root: str, limit: Optional[int] = None, per_class: Optional[int] = None) -> List[Dict[str, Any]]:
    """Collect images from `root` (recursively) or from a single file path."""
    entries: List[Dict[str, Any]] = []
    if os.path.isfile(root):
        entries.append({"file_path": os.path.abspath(root), "folder": os.path.dirname(root), "class_name": None})
        return entries

    for path in sorted(glob.glob(os.path.join(root, "**", "*"), recursive=True)):
        if not path.lower().endswith(IMAGE_EXTENSIONS) or not os.path.isfile(path):
            continue
        if "augmented" in path.replace("\\", "/").split("/"):
            continue
        folder = os.path.basename(os.path.dirname(path)).lower()
        entries.append({"file_path": os.path.abspath(path), "folder": folder, "class_name": folder})

    if per_class:
        grouped: Dict[str, List[Dict[str, Any]]] = {}
        for entry in entries:
            grouped.setdefault(entry["folder"], []).append(entry)
        picked: List[Dict[str, Any]] = []
        for folder, items in grouped.items():
            picked.extend(items[:per_class])
        entries = sorted(picked, key=lambda e: (e["folder"], e["file_path"]))
    if limit:
        entries = entries[:limit]
    return entries


def propose_dataset(
    root: str,
    limit: Optional[int] = None,
    per_class: Optional[int] = None,
    class_map: Optional[Dict[str, str]] = None,
    min_confidence: float = 0.0,
) -> Dict[str, Any]:
    class_map = class_map or {}
    entries = find_images(root, limit=limit, per_class=per_class)
    proposals: List[Dict[str, Any]] = []
    skipped: List[Dict[str, Any]] = []

    for entry in entries:
        image = cv2.imread(entry["file_path"])
        if image is None:
            skipped.append({**entry, "reason": "unreadable"})
            continue
        h, w = image.shape[:2]
        bbox, confidence, method = propose_box(image)
        if bbox[2] < 10 or bbox[3] < 10 or confidence < min_confidence:
            skipped.append({**entry, "reason": "low confidence", "confidence": confidence})
            continue
        folder_class = entry["class_name"] or "object"
        class_name = class_map.get(folder_class, class_map.get(str(folder_class).lower(), folder_class))
        proposals.append(
            {
                "file_path": entry["file_path"],
                "file_name": os.path.basename(entry["file_path"]),
                "folder": entry["folder"],
                "class_name": class_name,
                "width": w,
                "height": h,
                "bbox": bbox,                    # pascal_voc absolute
                "confidence": confidence,
                "method": method,
                "source": "auto_annotate_proposal",
            }
        )

    return {
        "status": "ok",
        "root": os.path.abspath(root),
        "count": len(proposals),
        "skipped": len(skipped),
        "proposals": proposals,
        "skipped_details": skipped,
        "engine": "classical CV (Lab saliency + Otsu + contours) — no pretrained model",
    }


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="VisionBharat V2 annotation accelerator (classical CV proposals)")
    parser.add_argument("--images", required=True, help="folder (scanned recursively) or a single image path")
    parser.add_argument("--limit", type=int, default=None, help="max number of proposals")
    parser.add_argument("--per-class", type=int, default=None, help="max proposals per subfolder")
    parser.add_argument("--class-map", default="", help="folder=class pairs, e.g. bell=temple_bell,oillamp=clay_diya")
    parser.add_argument("--min-confidence", type=float, default=0.0)
    parser.add_argument("--json-out", default=None, help="write the proposals JSON here")
    args = parser.parse_args(argv)

    class_map: Dict[str, str] = {}
    for pair in (args.class_map or "").split(","):
        if "=" in pair:
            key, value = pair.split("=", 1)
            class_map[key.strip().lower()] = value.strip()

    result = propose_dataset(
        args.images,
        limit=args.limit,
        per_class=args.per_class,
        class_map=class_map,
        min_confidence=args.min_confidence,
    )

    if args.json_out:
        os.makedirs(os.path.dirname(os.path.abspath(args.json_out)) or ".", exist_ok=True)
        with open(args.json_out, "w", encoding="utf-8") as fh:
            json.dump(result, fh, indent=2)
        result["json_out"] = os.path.abspath(args.json_out)

    print("VBAUTO_RESULT:" + json.dumps(result))
    print(f"[AutoAnnotate] {result['count']} proposals ({result['engine']})", file=sys.stderr)
    return 0 if result["count"] > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
