"""
VisionBharat V2 — Universal Inference
=====================================
One entry point for every input the platform supports:

  * `--image path/to.jpg`                    (drag & drop upload, OpenCV frame)
  * `--base64 "data:image/jpeg;base64,..."`  (Ctrl+V paste, webcam frame, canvas)

It loads a VisionBharat V2 checkpoint, runs a single forward pass, decodes +
NMS-suppresses the predictions, draws the annotated result with OpenCV and
prints a machine-readable JSON contract for the Next.js API:

    {"status":"ok","predictions":[{"class":"temple_bell","class_id":0,
      "confidence":0.94,"bbox":[x1,y1,x2,y2]}],
     "annotated_image_path":"outputs/inference/annotated_20260101_120000.jpg",
     "num_detections":1,"time_ms":120,"image_width":1024,"image_height":768}

Project: VisionBharat — DataGenesis 2026
Author : Arul Maria Agnes
"""

from __future__ import annotations

import argparse
import base64
import binascii
import json
import os
import re
import sys
import time
from typing import Any, Dict, List, Optional, Sequence, Tuple

import cv2
import numpy as np
import torch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from model import MODEL_NAME, create_visionbharat_model  # noqa: E402
from detection_utils import decode_predictions_per_image  # noqa: E402

#: Distinct BGR colours per class index — drawn as filled label chips.
CLASS_COLORS: List[Tuple[int, int, int]] = [
    (56, 184, 16),    # green
    (11, 158, 245),   # orange
    (86, 85, 246),    # red-ish
    (246, 130, 59),   # blue
    (239, 68, 68),    # crimson
    (203, 120, 139),  # violet
    (208, 182, 6),    # cyan
    (163, 76, 236),   # pink
    (61, 89, 16),     # dark green
    (0, 215, 255),    # amber
]

DEFAULT_OUTPUT_DIR = "outputs/inference"


# ---------------------------------------------------------------------------
# Input helpers
# ---------------------------------------------------------------------------


def decode_base64_image(data: str) -> np.ndarray:
    """Decode a data URL or a bare base64 string into a BGR OpenCV image."""
    if not data:
        raise ValueError("empty base64 payload")
    payload = data.strip()
    if payload.startswith("data:"):
        # data:image/jpeg;base64,<data>
        match = re.match(r"data:[^;]+;base64,(.*)$", payload, flags=re.DOTALL)
        if not match:
            raise ValueError("malformed data URL")
        payload = match.group(1)
    payload = payload.strip()
    try:
        raw = base64.b64decode(payload, validate=False)
    except (binascii.Error, ValueError) as exc:
        raise ValueError(f"invalid base64 image: {exc}") from exc
    arr = np.frombuffer(raw, dtype=np.uint8)
    image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("base64 payload is not a decodable image")
    return image


def load_image(image_path: Optional[str], base64_data: Optional[str]) -> Tuple[np.ndarray, str]:
    """Load the input image from a path or from base64; returns (image, source)."""
    if base64_data:
        return decode_base64_image(base64_data), "base64"
    if not image_path:
        raise ValueError("either --image or --base64 is required")
    image = cv2.imread(image_path)
    if image is None:
        raise FileNotFoundError(f"could not read image: {image_path}")
    return image, os.path.abspath(image_path)


# ---------------------------------------------------------------------------
# Model
# ---------------------------------------------------------------------------


def load_model(model_path: str, device: torch.device, num_classes: Optional[int] = None,
               class_names: Optional[Sequence[str]] = None) -> Tuple[torch.nn.Module, List[str]]:
    if not os.path.isfile(model_path):
        raise FileNotFoundError(
            f"checkpoint not found: {model_path} — run the one-click pipeline or ai/train.py first"
        )
    ckpt = torch.load(model_path, map_location=device)
    if not isinstance(ckpt, dict):
        raise ValueError(f"{model_path} is not a VisionBharat checkpoint")

    ckpt_classes = list(ckpt.get("class_names") or ckpt.get("classes") or [])
    names = list(class_names or ckpt_classes)
    n_classes = int(num_classes or ckpt.get("num_classes") or len(names) or 1)
    if names and len(names) != n_classes:
        n_classes = len(names)
    if not names:
        names = [f"class_{i}" for i in range(n_classes)]

    model = create_visionbharat_model(num_classes=n_classes, input_size=int(ckpt.get("input_size", 640)))
    state = ckpt.get("model") or ckpt.get("model_state")
    if state is None:
        raise ValueError("checkpoint has no model weights")
    model.load_state_dict(state)      # our OWN checkpoint (from-scratch training output)
    model.to(device).eval()
    return model, names


# ---------------------------------------------------------------------------
# Post-processing / drawing
# ---------------------------------------------------------------------------


def draw_detections(
    image: np.ndarray,
    detections: List[Dict[str, Any]],
    class_names: Sequence[str],
) -> np.ndarray:
    """Draw boxes + label chips, exactly like the web overlay but in OpenCV."""
    canvas = image.copy()
    h, w = canvas.shape[:2]
    thickness = max(2, int(round(min(w, h) / 320)))
    font_scale = max(0.45, min(w, h) / 900.0)

    for det in detections:
        cid = int(det["class_id"])
        color = CLASS_COLORS[cid % len(CLASS_COLORS)]
        x1, y1, x2, y2 = (int(round(v)) for v in det["bbox"])
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w - 1, x2), min(h - 1, y2)
        cv2.rectangle(canvas, (x1, y1), (x2, y2), color, thickness)

        label = f"{det['class']} {det['confidence'] * 100:.1f}%"
        (tw, th), baseline = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, font_scale, max(1, thickness - 1))
        chip_top = max(0, y1 - th - baseline - 8)
        cv2.rectangle(canvas, (x1, chip_top), (x1 + tw + 10, chip_top + th + baseline + 8), color, -1)
        cv2.putText(
            canvas,
            label,
            (x1 + 5, chip_top + th + 4),
            cv2.FONT_HERSHEY_SIMPLEX,
            font_scale,
            (255, 255, 255),
            max(1, thickness - 1),
            cv2.LINE_AA,
        )

    # Watermark makes it obvious which model produced the frame.
    cv2.putText(
        canvas,
        f"{MODEL_NAME} | from scratch | no pretrained",
        (10, h - 12),
        cv2.FONT_HERSHEY_SIMPLEX,
        max(0.4, font_scale * 0.8),
        (230, 230, 230),
        1,
        cv2.LINE_AA,
    )
    return canvas


def infer(
    image_path: Optional[str] = None,
    base64_data: Optional[str] = None,
    model_path: str = "ai/checkpoints/best.pt",
    num_classes: Optional[int] = None,
    class_names: Optional[Sequence[str]] = None,
    conf: float = 0.25,
    iou: float = 0.45,
    img_size: int = 640,
    output_dir: str = DEFAULT_OUTPUT_DIR,
    device_str: Optional[str] = None,
    save_annotated: bool = True,
) -> Dict[str, Any]:
    """Run the complete single-image inference contract."""
    t_start = time.perf_counter()
    device = torch.device(device_str or ("cuda" if torch.cuda.is_available() else "cpu"))
    image, source = load_image(image_path, base64_data)
    model, names = load_model(model_path, device, num_classes, class_names)

    orig_h, orig_w = image.shape[:2]
    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    resized = cv2.resize(rgb, (img_size, img_size), interpolation=cv2.INTER_LINEAR)
    tensor = torch.from_numpy(resized.astype(np.float32) / 255.0).permute(2, 0, 1).unsqueeze(0).to(device)

    t_infer = time.perf_counter()
    with torch.no_grad():
        outputs = model(tensor)
    boxes, scores, classes = decode_predictions_per_image(
        outputs, model.anchors, len(names), conf, img_size, nms_iou=iou  # type: ignore[attr-defined]
    )[0]
    infer_ms = (time.perf_counter() - t_infer) * 1000

    sx, sy = orig_w / img_size, orig_h / img_size
    detections: List[Dict[str, Any]] = []
    for i in range(len(scores)):
        x1, y1, x2, y2 = boxes[i]
        cid = int(classes[i])
        detections.append(
            {
                "class": names[cid] if cid < len(names) else f"class_{cid}",
                "class_id": cid,
                "confidence": round(float(scores[i]), 4),
                "bbox": [round(float(x1) * sx, 2), round(float(y1) * sy, 2),
                         round(float(x2) * sx, 2), round(float(y2) * sy, 2)],
                "center": [round(float((x1 + x2) / 2) * sx, 1), round(float((y1 + y2) / 2) * sy, 1)],
                "area": round(float((x2 - x1) * sx * (y2 - y1) * sy), 1),
            }
        )
    detections.sort(key=lambda d: -d["confidence"])

    annotated_path = None
    if save_annotated:
        os.makedirs(output_dir, exist_ok=True)
        stamp = time.strftime("%Y%m%d_%H%M%S") + f"_{int((time.time() % 1) * 1000):03d}"
        stem = os.path.splitext(os.path.basename(image_path))[0] if image_path else "paste"
        annotated_path = os.path.abspath(os.path.join(output_dir, f"annotated_{stem}_{stamp}.jpg"))
        cv2.imwrite(annotated_path, draw_detections(image, detections, names))

    return {
        "status": "ok",
        "model": MODEL_NAME,
        "model_path": os.path.abspath(model_path),
        "source": source,
        "image_path": os.path.abspath(image_path) if image_path else None,
        "predictions": detections,
        "detections": detections,                      # alias kept for older clients
        "num_detections": len(detections),
        "numDetections": len(detections),
        "image_width": orig_w,
        "image_height": orig_h,
        "class_names": names,
        "num_classes": len(names),
        "confidence_threshold": conf,
        "iou_threshold": iou,
        "annotated_image_path": annotated_path,
        "inference_time_ms": round(infer_ms, 2),
        "inferenceTimeMs": round(infer_ms, 2),
        "total_time_ms": round((time.perf_counter() - t_start) * 1000, 2),
        "time_ms": round((time.perf_counter() - t_start) * 1000, 2),
        "device": str(device),
        "from_scratch": True,
        "pretrained_used": False,
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="VisionBharat V2 universal inference (image or base64)")
    parser.add_argument("--image", default=None, help="path to an image file")
    parser.add_argument("--base64", default=None, help="data URL or bare base64 image payload")
    parser.add_argument("--model", "--checkpoint", dest="model", default="ai/checkpoints/best.pt")
    parser.add_argument("--num_classes", type=int, default=None)
    parser.add_argument("--class_names", default="", help="comma separated class names")
    parser.add_argument("--conf", "--confidence", dest="conf", type=float, default=0.25)
    parser.add_argument("--iou", type=float, default=0.45)
    parser.add_argument("--img_size", type=int, default=640)
    parser.add_argument("--output", "--output_dir", dest="output", default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--no-save", action="store_true", help="skip writing the annotated image")
    parser.add_argument("--device", default=None)
    args = parser.parse_args(argv)

    names = [c.strip() for c in (args.class_names or "").split(",") if c.strip()]
    try:
        result = infer(
            image_path=args.image,
            base64_data=args.base64,
            model_path=args.model,
            num_classes=args.num_classes,
            class_names=names or None,
            conf=args.conf,
            iou=args.iou,
            img_size=args.img_size,
            output_dir=args.output,
            device_str=args.device,
            save_annotated=not args.no_save,
        )
    except Exception as exc:
        payload = {"status": "error", "error": str(exc), "predictions": [], "num_detections": 0}
        print("VBINFER_RESULT:" + json.dumps(payload))
        print(json.dumps(payload))
        print(f"[Infer] FAILED: {exc}", file=sys.stderr)
        return 1

    # Machine-readable contract: one prefixed line for the API, one plain JSON line.
    print("VBINFER_RESULT:" + json.dumps(result))
    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    sys.exit(main())
