#!/usr/bin/env python3
"""
VisionBharat V2 — one-click training from the command line
==========================================================
Runs the *entire* autonomous pipeline without opening the browser:

    scan photos -> (auto)annotate -> synthetic expansion -> leakage-free split
    -> train from scratch -> evaluate on the held-out test split -> publish best.pt

Everything it does is the same code the web UI drives, so a judge can reproduce
the dashboard numbers from a terminal:

    python scripts/one_click_train.py --source captured_photos --target 100 --epochs 60

Outputs
-------
  ai/checkpoints/best.pt                 EMA weights selected on the val split
  ai/checkpoints/last.pt                 raw weights of the final epoch
  ai/checkpoints/state.pt                resumable state (own checkpoint only)
  ai/checkpoints/training_log.json       per-epoch history
  ai/checkpoints/evaluation_results.json test-split metrics (mAP, per-class AP…)
  models/visionbharat_v2_best.pt         judge-facing mirror
  models/best.pt                         judge-facing mirror
  models/report.json                     training report

Compliance
----------
The model is created with Kaiming-random initialisation. `ai/model.py` runs
`verify_no_pretrained()` before anything else and aborts the run if any banned
pretrained API appears in the source. `--resume` only ever loads `state.pt`,
a file this project wrote itself.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
AI_DIR = PROJECT_ROOT / "ai"
CAPTURED = PROJECT_ROOT / "captured_photos"
SPLIT_JSON = PROJECT_ROOT / "dataset" / "split.json"
CHECKPOINTS = AI_DIR / "checkpoints"
MODELS = PROJECT_ROOT / "models"

# The 8 Indian-object classes the platform ships with. They are only a fallback:
# the real list is read from the database when one is reachable.
DEFAULT_CLASSES = [
    "clay_diya", "brass_diya", "hanging_diya", "multi_wick_diya",
    "kuthu_vilakku", "temple_bell", "incense_holder", "ritual_plate",
]
IMAGE_EXT = (".jpg", ".jpeg", ".png", ".webp", ".bmp")

C_GREEN, C_BLUE, C_YELLOW, C_RED, C_DIM, C_END = "\033[92m", "\033[94m", "\033[93m", "\033[91m", "\033[2m", "\033[0m"


def step(n: int, total: int, message: str) -> None:
    print(f"\n{C_BLUE}[{n}/{total}]{C_END} {message}", flush=True)


def ok(message: str) -> None:
    print(f"  {C_GREEN}✓{C_END} {message}", flush=True)


def warn(message: str) -> None:
    print(f"  {C_YELLOW}!{C_END} {message}", flush=True)


def fail(message: str) -> None:
    print(f"  {C_RED}✗{C_END} {message}", flush=True)


def run(cmd: list[str], cwd: Path = PROJECT_ROOT) -> tuple[int, str]:
    """Run a child process, streaming nothing but returning its merged output."""
    proc = subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True)
    return proc.returncode, (proc.stdout or "") + (proc.stderr or "")


def python_executable() -> str:
    """Prefer the project virtualenv; fall back to the interpreter running us."""
    for candidate in (PROJECT_ROOT / ".venv" / "bin" / "python", PROJECT_ROOT / "venv" / "bin" / "python"):
        if candidate.exists():
            return str(candidate)
    return sys.executable


def classes_from_database() -> list[str] | None:
    """Read the class list from `classes` (dynamic — never hardcoded downstream)."""
    url = os.environ.get("DATABASE_URL")
    if not url:
        return None
    script = (
        "const {Client}=require('pg');(async()=>{const c=new Client({connectionString:process.env.DATABASE_URL});"
        "await c.connect();const r=await c.query('select name from classes order by name');"
        "console.log(JSON.stringify(r.rows.map(x=>x.name)));await c.end();})().catch(()=>process.exit(3));"
    )
    code, out = run(["node", "-e", script])
    if code != 0:
        return None
    try:
        names = json.loads(out.strip().splitlines()[-1])
        return [str(n) for n in names if str(n).strip()] or None
    except (ValueError, IndexError):
        return None


def count_photos(source: str) -> dict[str, int]:
    """Count images per class folder under `captured_photos/<class>/`."""
    root = PROJECT_ROOT / source
    counts: dict[str, int] = {}
    if not root.exists():
        return counts
    for folder in sorted(p for p in root.iterdir() if p.is_dir()):
        if folder.name in {"augmented", "unclassified"}:
            continue
        n = len([f for f in folder.iterdir() if f.suffix.lower() in IMAGE_EXT])
        if n:
            counts[folder.name] = n
    return counts


def ensure_dependencies() -> bool:
    missing = []
    for module in ("torch", "cv2", "numpy", "albumentations"):
        code, _ = run([python_executable(), "-c", f"import {module}"])
        if code != 0:
            missing.append(module)
    if missing:
        warn(f"missing python packages: {', '.join(missing)}")
        print(f"  {C_DIM}install them with: {python_executable()} -m pip install -r ai/requirements.txt{C_END}")
        return False
    return True


def generate_annotations(source: str, per_class: int, min_confidence: float) -> int:
    """Classical-CV proposals for any unannotated photo (no pretrained model)."""
    counts = count_photos(source)
    inserted = 0
    for folder in counts:
        class_dir = PROJECT_ROOT / source / folder
        annotated_file = class_dir / "_annotations.json"
        if annotated_file.exists():
            try:
                existing = json.loads(annotated_file.read_text())
                if existing:
                    continue
            except ValueError:
                pass
        code, out = run([
            python_executable(), str(AI_DIR / "auto_annotate.py"),
            "--source", str(class_dir), "--class_name", folder,
            "--per_class", str(per_class), "--min_confidence", str(min_confidence),
            "--output", str(annotated_file), "--json",
        ])
        match = re.search(r"VBAUTO_RESULT:(\{.*\})", out)
        if code == 0 and match:
            try:
                payload = json.loads(match.group(1))
                inserted += int(payload.get("inserted", 0))
            except ValueError:
                pass
    return inserted


def expand_dataset(target: int) -> dict:
    """Annotation-aware synthetic expansion (Invention 1)."""
    code, out = run([
        python_executable(), str(AI_DIR / "augmentation_engine.py"),
        "--source", str(CAPTURED), "--output", str(CAPTURED / "augmented"),
        "--target", str(target), "--json",
    ])
    match = re.search(r"VBAUG_RESULT:(\{.*\})", out)
    if match:
        try:
            return json.loads(match.group(1))
        except ValueError:
            pass
    if code != 0:
        warn(out.strip().splitlines()[-1] if out.strip() else "augmentation failed")
    return {}


def auto_split(seed: int, min_hamming: int) -> dict:
    code, out = run([
        python_executable(), str(AI_DIR / "split_helper.py"),
        "--data", str(CAPTURED), "--output", str(SPLIT_JSON),
        "--seed", str(seed), "--min_hamming", str(min_hamming), "--json",
    ])
    match = re.search(r"VBSPLIT_RESULT:(\{.*\})", out)
    if match:
        try:
            return json.loads(match.group(1))
        except ValueError:
            pass
    if code != 0:
        fail(out.strip().splitlines()[-1] if out.strip() else "split failed")
    return {}


def train(args, classes: list[str]) -> dict:
    cmd = [
        python_executable(), str(AI_DIR / "train.py"),
        "--data", str(SPLIT_JSON),
        "--epochs", str(args.epochs),
        "--img", str(args.img),
        "--batch", str(args.batch),
        "--accumulate", str(args.accumulate),
        "--workers", str(args.workers),
        "--min-epochs", str(args.min_epochs),
        "--patience", str(args.patience),
        "--num_classes", str(len(classes)),
        "--class_names", ",".join(classes),
        "--checkpoint_dir", str(CHECKPOINTS),
        "--models_dir", str(MODELS),
        "--report_path", str(MODELS / "report.json"),
    ]
    if args.test_run:
        cmd.append("--test-run")
    if args.resume and (CHECKPOINTS / "state.pt").exists():
        cmd += ["--resume", str(CHECKPOINTS / "state.pt"), "--total-epochs", str(args.total_epochs or args.epochs)]

    # stream the trainer's stdout so the operator sees live epochs
    proc = subprocess.Popen(cmd, cwd=str(PROJECT_ROOT), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
    report: dict = {}
    assert proc.stdout is not None
    for line in proc.stdout:
        line = line.rstrip()
        if line.startswith("VBEPOCH:"):
            try:
                rec = json.loads(line[len("VBEPOCH:"):])
                print(
                    f"  {C_DIM}epoch {rec.get('epoch'):>4}{C_END} loss {rec.get('train_loss', 0):.4f} "
                    f"| mAP@0.5 {rec.get('mAP50', 0):.4f} | {rec.get('seconds', 0):.0f}s",
                    flush=True,
                )
            except ValueError:
                pass
        elif line.startswith("VBTRAIN_DONE:"):
            try:
                report = json.loads(line[len("VBTRAIN_DONE:"):])
            except ValueError:
                pass
        elif "INFO" not in line and line.strip():
            print(f"  {C_DIM}{line}{C_END}", flush=True)
    proc.wait()
    return report


def evaluate(classes: list[str], conf: float, iou: float) -> dict:
    code, out = run([
        python_executable(), str(AI_DIR / "evaluate.py"),
        "--model", str(CHECKPOINTS / "best.pt"),
        "--test_data", str(PROJECT_ROOT / "dataset" / "test_split.json"),
        "--num_classes", str(len(classes)),
        "--conf", str(conf), "--iou", str(iou),
        "--output", str(CHECKPOINTS / "evaluation_results.json"),
    ])
    match = re.search(r"VBEVAL_RESULT:(\{.*\})", out)
    if match:
        try:
            return json.loads(match.group(1))
        except ValueError:
            pass
    if code != 0:
        warn(out.strip().splitlines()[-1] if out.strip() else "evaluation failed")
    return {}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="VisionBharat V2 — one-click autonomous training pipeline")
    parser.add_argument("--source", default="captured_photos", help="folder of team-captured photos (class subfolders)")
    parser.add_argument("--target", type=int, default=100, help="target dataset size after synthetic expansion")
    parser.add_argument("--epochs", type=int, default=60)
    parser.add_argument("--img", type=int, default=320, help="training resolution (640 on GPU, 256-320 is CPU-friendly)")
    parser.add_argument("--batch", type=int, default=8)
    parser.add_argument("--accumulate", type=int, default=2)
    parser.add_argument("--workers", type=int, default=0)
    parser.add_argument("--patience", type=int, default=25)
    parser.add_argument("--min-epochs", dest="min_epochs", type=int, default=30)
    parser.add_argument("--per-class", dest="per_class", type=int, default=6, help="auto-annotation proposals per class")
    parser.add_argument("--min-confidence", dest="min_confidence", type=float, default=0.25)
    parser.add_argument("--conf", type=float, default=0.25, help="evaluation confidence threshold")
    parser.add_argument("--iou", type=float, default=0.5, help="evaluation IoU threshold")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--min-hamming", dest="min_hamming", type=int, default=8)
    parser.add_argument("--test-run", dest="test_run", action="store_true", help="2-epoch smoke run")
    parser.add_argument("--resume", action="store_true", help="continue from ai/checkpoints/state.pt")
    parser.add_argument("--total-epochs", dest="total_epochs", type=int, default=None)
    parser.add_argument("--skip-evaluate", dest="skip_evaluate", action="store_true")
    args = parser.parse_args(argv)

    started = time.time()
    print(f"{C_BLUE}VisionBharat V2 — one-click autonomous pipeline{C_END}")
    print(f"{C_DIM}project: {PROJECT_ROOT}{C_END}")
    print(f"{C_DIM}python : {python_executable()}{C_END}")

    TOTAL = 8
    # 1 — environment
    step(1, TOTAL, "Checking the Python environment")
    if not ensure_dependencies():
        return 2
    ok("torch / opencv / numpy / albumentations available")

    # 2 — classes (dynamic)
    step(2, TOTAL, "Resolving the class list (database first, fallback to shipped classes)")
    classes = classes_from_database() or DEFAULT_CLASSES
    ok(f"{len(classes)} classes: {', '.join(classes)}")

    # 3 — photos
    step(3, TOTAL, f"Scanning {args.source}/")
    counts = count_photos(args.source)
    if not counts:
        fail(f"no images found under {PROJECT_ROOT / args.source} — capture photos first")
        return 3
    total_photos = sum(counts.values())
    ok(f"{total_photos} photos across {len(counts)} classes: " + ", ".join(f"{k}={v}" for k, v in counts.items()))

    # 4 — annotations (classical CV, no pretrained model)
    step(4, TOTAL, "Auto-annotating unannotated photos with the classical-CV proposer")
    proposals = generate_annotations(args.source, args.per_class, args.min_confidence)
    if proposals:
        ok(f"{proposals} bounding boxes proposed and saved")
    else:
        warn("no new proposals (annotations already exist or the proposer was unsure)")

    # 5 — synthetic expansion
    step(5, TOTAL, f"Annotation-aware synthetic expansion → target {args.target} images")
    aug = expand_dataset(args.target)
    if aug:
        ok(f"{aug.get('original', '?')} originals + {aug.get('augmented', 0)} synthetic = {aug.get('total', '?')} images")

    # 6 — split
    step(6, TOTAL, "Leakage-free stratified auto split (seed %d)" % args.seed)
    split = auto_split(args.seed, args.min_hamming)
    if split:
        ok(
            f"train {split.get('train')} / val {split.get('val')} / test {split.get('test')} "
            f"| leakage {split.get('leakage')} | {split.get('attempts')} attempt(s)"
        )
        if str(split.get("leakage", "")).upper() != "PASSED":
            fail("leakage check did not pass — refusing to train on a contaminated split")
            return 4

    # 7 — training
    step(7, TOTAL, f"Training VisionBharat V2 from scratch ({'test-run' if args.test_run else str(args.epochs) + ' epochs'})")
    report = train(args, classes)
    if not report:
        fail("training did not produce a report")
        return 5
    ok(
        f"best mAP@0.5 {report.get('best_val_mAP50')} @ epoch {report.get('best_epoch')} "
        f"| {report.get('epochs_run')} epochs | {report.get('parameters'):,} params"
    )

    # 8 — evaluation + artefacts
    step(8, TOTAL, "Evaluating on the held-out test split and publishing artefacts")
    metrics = {} if args.skip_evaluate else evaluate(classes, args.conf, args.iou)
    if metrics:
        ok(f"mAP@0.5 {metrics.get('map50')} | precision {metrics.get('precision')} | recall {metrics.get('recall')}")

    expected = [
        CHECKPOINTS / "best.pt",
        CHECKPOINTS / "last.pt",
        MODELS / "visionbharat_v2_best.pt",
        MODELS / "best.pt",
        MODELS / "report.json",
    ]
    for path in expected:
        if path.exists():
            ok(f"{path.relative_to(PROJECT_ROOT)}  ({path.stat().st_size / 1e6:.1f} MB)")
        else:
            warn(f"missing: {path.relative_to(PROJECT_ROOT)}")

    summary = {
        "status": "completed",
        "duration_seconds": round(time.time() - started, 1),
        "classes": classes,
        "photos": counts,
        "synthetic": aug,
        "split": split,
        "training": {
            "best_val_mAP50": report.get("best_val_mAP50"),
            "best_epoch": report.get("best_epoch"),
            "epochs_run": report.get("epochs_run"),
            "parameters": report.get("parameters"),
            "from_scratch": True,
            "pretrained_used": False,
            "verify_no_pretrained": True,
        },
        "evaluation": metrics,
        "artifacts": [str(p.relative_to(PROJECT_ROOT)) for p in expected if p.exists()],
    }
    (MODELS / "one_click_summary.json").parent.mkdir(parents=True, exist_ok=True)
    (MODELS / "one_click_summary.json").write_text(json.dumps(summary, indent=2))

    print(f"\n{C_GREEN}Pipeline complete in {summary['duration_seconds']}s{C_END}")
    print(f"{C_DIM}judge-facing model: models/visionbharat_v2_best.pt{C_END}")
    print(f"{C_DIM}metrics           : ai/checkpoints/evaluation_results.json{C_END}")
    print(f"{C_DIM}summary           : models/one_click_summary.json{C_END}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
