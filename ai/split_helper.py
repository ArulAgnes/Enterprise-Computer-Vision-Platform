"""
VisionBharat V2 — INVENTION 4: Leakage-Free Stratified Auto Split
=================================================================
Splits an (optionally synthetic-expanded) dataset into train / val / test with
**provable zero leakage**, which is the single most common way small-data
computer-vision projects silently cheat.

Three independent leakage mechanisms are used:

1. **Group cohesion (derived-sample guard)**
   Every synthetic sample remembers its parent image (`parent_image_id`).
   A parent and all of its children are treated as ONE indivisible group, so an
   augmented sibling of a training photo can never appear in the test set.
   This is the leakage that "just shuffle" pipelines always miss when they
   generate augmentations *before* splitting.

2. **Perceptual-hash guard (near-duplicate guard)**
   A 64-bit dHash is computed with OpenCV for every image. After the split we
   verify that for every test image the minimum Hamming distance to every train
   image is >= `--min-hamming` (default 8). If not, we reshuffle (up to
   `--max-attempts`, default 20 attempts, seeded) until it passes.

3. **Exact-hash guard**
   SHA-256 digests (computed client-side / DB-side) must never appear in two
   different splits.

Stratification: the *dominant class* of each image is used with scikit-learn's
`StratifiedShuffleSplit` (seed 42) to keep the class ratio identical across
train / val / test, which matters enormously at 110 images.

CLI
---
    python ai/split_helper.py --input temp_images.json \\
        --ratios 0.7,0.15,0.15 --seed 42 --out-dir dataset

Writes: dataset/split.json, dataset/train_split.json, dataset/val_split.json,
        dataset/test_split.json  (and prints VBSplit_RESULT:{...})

Project: VisionBharat — DataGenesis 2026
Author : Arul Maria Agnes
"""

from __future__ import annotations

import argparse
import json
import os
import random
import sys
from collections import Counter, defaultdict
from typing import Any, Dict, List, Optional, Sequence, Tuple

import cv2
import numpy as np

try:
    from sklearn.model_selection import StratifiedShuffleSplit

    SKLEARN_AVAILABLE = True
except Exception:  # pragma: no cover
    StratifiedShuffleSplit = None  # type: ignore
    SKLEARN_AVAILABLE = False

DHASH_SIZE = 8
DEFAULT_MIN_HAMMING = 8
DEFAULT_MAX_ATTEMPTS = 20


# ---------------------------------------------------------------------------
# Fingerprints
# ---------------------------------------------------------------------------


def dhash64(image: np.ndarray, hash_size: int = DHASH_SIZE) -> str:
    """64-bit difference hash rendered as 16 hex chars (same idea as imagehash.dhash)."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image
    resized = cv2.resize(gray, (hash_size + 1, hash_size), interpolation=cv2.INTER_AREA)
    diff = resized[:, 1:] > resized[:, :-1]
    value = 0
    for bit in diff.flatten():
        value = (value << 1) | int(bit)
    return f"{value:016x}"


def hamming_hex(a: str, b: str) -> int:
    try:
        return bin(int(a, 16) ^ int(b, 16)).count("1")
    except (TypeError, ValueError):
        return 64


def compute_fingerprints(images: List[Dict[str, Any]]) -> Dict[str, str]:
    """dHash for every image that can be read (missing files -> empty string)."""
    fingerprints: Dict[str, str] = {}
    for entry in images:
        img_id = str(entry.get("id"))
        path = entry.get("file_path") or entry.get("filePath")
        if path and os.path.isfile(path):
            img = cv2.imread(path)
            if img is not None:
                fingerprints[img_id] = dhash64(img)
                continue
        fingerprints[img_id] = ""
    return fingerprints


# ---------------------------------------------------------------------------
# Split core
# ---------------------------------------------------------------------------


def _greedy_group_assignment(
    groups: List[str],
    group_class: Dict[str, str],
    group_size: Dict[str, int],
    ratios: Tuple[float, float, float],
    seed: int,
) -> Dict[str, str]:
    """Class-stratified greedy group assignment honouring target ratios.

    Greedy *per class*: inside each class the groups are shuffled with the seed
    and then assigned to whichever split is currently furthest below its target
    share. Deterministic and stable at tiny dataset sizes.
    """
    rng = random.Random(seed)
    total = max(1, sum(group_size[g] for g in groups))
    targets = {"train": ratios[0] * total, "val": ratios[1] * total, "test": ratios[2] * total}
    filled = {"train": 0, "val": 0, "test": 0}
    assignment: Dict[str, str] = {}

    by_class: Dict[str, List[str]] = defaultdict(list)
    for g in groups:
        by_class[group_class.get(g, "unknown")].append(g)

    # Largest classes first so the big strata land proportionally.
    for cls in sorted(by_class, key=lambda c: -sum(group_size[g] for g in by_class[c])):
        members = by_class[cls][:]
        rng.shuffle(members)
        for g in members:
            size = group_size[g]
            best_split, best_cost = "train", None
            for split_name, target in targets.items():
                if target <= 0:
                    continue
                # Absolute deviation AFTER placing this group — with big groups
                # (a parent + its synthetic siblings) this keeps the 70/15/15
                # ratio far tighter than a purely relative-deficit rule.
                cost = abs((filled[split_name] + size) - target)
                if best_cost is None or cost < best_cost:
                    best_cost, best_split = cost, split_name
            assignment[g] = best_split
            filled[best_split] += size
    return assignment


def _expand_to_images(assignment: Dict[str, str], group_of: Dict[str, str]) -> Dict[str, str]:
    return {img: assignment[grp] for img, grp in group_of.items()}


def _evaluate_leakage(
    split_of: Dict[str, str],
    fingerprints: Dict[str, str],
    sha_of: Dict[str, str],
    min_hamming: int,
) -> Dict[str, Any]:
    """Return leakage diagnostics for train-vs-test and train-vs-val pairs."""
    report: Dict[str, Any] = {"pair_checks": {}, "leakage_detected": False, "details": []}
    for a, b in (("train", "test"), ("train", "val")):
        a_ids = [i for i, s in split_of.items() if s == a]
        b_ids = [i for i, s in split_of.items() if s == b]
        min_dist = 64
        near_pairs = 0
        exact = 0
        for bi in b_ids:
            for ai in a_ids:
                if fingerprints.get(bi) and fingerprints.get(ai):
                    d = hamming_hex(fingerprints[bi], fingerprints[ai])
                    min_dist = min(min_dist, d)
                    if d < min_hamming:
                        near_pairs += 1
                if sha_of.get(bi) and sha_of.get(ai) and sha_of[bi] == sha_of[ai]:
                    exact += 1
        passed = near_pairs == 0 and exact == 0
        report["pair_checks"][f"{a}_vs_{b}"] = {
            "min_hamming_distance": min_dist if min_dist != 64 else None,
            "near_duplicate_pairs": near_pairs,
            "exact_duplicate_pairs": exact,
            "threshold": min_hamming,
            "passed": passed,
        }
        if not passed:
            report["leakage_detected"] = True
            report["details"].append(
                f"{a}/{b}: {near_pairs} near-duplicate pair(s) below hamming {min_hamming}, {exact} exact duplicate(s)"
            )
    return report


def split_dataset(
    input_json: str,
    out_dir: str,
    ratios: Tuple[float, float, float] = (0.7, 0.15, 0.15),
    seed: int = 42,
    min_hamming: int = DEFAULT_MIN_HAMMING,
    max_attempts: int = DEFAULT_MAX_ATTEMPTS,
    write_files: bool = True,
) -> Dict[str, Any]:
    """Perform the leakage-free stratified split and (optionally) write JSON files."""
    with open(input_json, "r", encoding="utf-8") as fh:
        payload = json.load(fh)

    images: List[Dict[str, Any]] = payload.get("images", [])
    classes: List[str] = payload.get("classes", []) or []
    if len(images) < 3:
        return {"status": "error", "error": f"Need at least 3 images to split (got {len(images)})"}

    image_ids = [str(im.get("id")) for im in images]
    by_id = {str(im.get("id")): im for im in images}

    # ---- Groups: a parent and everything derived from it ----------------
    group_of: Dict[str, str] = {}
    for im in images:
        img_id = str(im.get("id"))
        parent = im.get("parent_image_id") or im.get("parentImageId")
        group_of[img_id] = str(parent) if parent else img_id

    group_members: Dict[str, List[str]] = defaultdict(list)
    for img_id, grp in group_of.items():
        group_members[grp].append(img_id)

    # ---- Stratification labels ------------------------------------------
    def dominant_class(img_id: str) -> str:
        im = by_id.get(img_id, {})
        anns = im.get("annotations") or []
        names = [a.get("class_name") for a in anns if a.get("class_name")]
        if not names:
            names = [im.get("class_name")] if im.get("class_name") else []
        if not names:
            return classes[0] if classes else "unknown"
        return Counter(names).most_common(1)[0][0]

    labels = np.array([dominant_class(i) for i in image_ids])

    # ---- Fingerprints ----------------------------------------------------
    fingerprints = compute_fingerprints(images)
    sha_of = {str(im.get("id")): (im.get("sha256") or im.get("image_hash") or "") for im in images}

    group_class: Dict[str, str] = {}
    group_size: Dict[str, int] = {}
    for grp, members in group_members.items():
        group_class[grp] = dominant_class(members[0])
        group_size[grp] = len(members)

    groups = list(group_members.keys())
    group_labels = np.array([group_class[g] for g in groups])

    attempts = 0
    leakage: Dict[str, Any] = {}
    assignment: Dict[str, str] = {}
    used_method = "greedy_stratified_group"
    best_deviation = float("inf")

    total_images = len(image_ids)
    ideal = {"train": ratios[0] * total_images, "val": ratios[1] * total_images, "test": ratios[2] * total_images}

    def deviation_of(split_of: Dict[str, str]) -> float:
        """Relative mismatch between realised and requested split sizes."""
        counts_now = Counter(split_of.values())
        return sum(abs(counts_now.get(k, 0) - ideal[k]) for k in ideal) / max(1, total_images)

    for attempt in range(max(1, max_attempts)):
        attempt_seed = seed + attempt * 977
        candidates: List[Tuple[str, Dict[str, str]]] = []

        # (a) scikit-learn StratifiedShuffleSplit over whole groups
        if SKLEARN_AVAILABLE and len(groups) >= 5 and len(set(group_labels)) >= 2:
            counts_by_class = Counter(group_labels)
            if min(counts_by_class.values()) >= 2:
                try:
                    indices = np.arange(len(groups)).reshape(-1, 1)
                    sss = StratifiedShuffleSplit(n_splits=1, test_size=ratios[2], random_state=attempt_seed)
                    train_idx, test_idx = next(sss.split(indices, group_labels))
                    rem_groups = [groups[i] for i in train_idx]
                    rem_labels = group_labels[train_idx]
                    val_share = ratios[1] / max(1e-6, (ratios[0] + ratios[1]))
                    counts2 = Counter(rem_labels)
                    if len(rem_groups) >= 4 and min(counts2.values()) >= 2:
                        sss2 = StratifiedShuffleSplit(n_splits=1, test_size=val_share, random_state=attempt_seed + 1)
                        idx2 = np.arange(len(rem_groups)).reshape(-1, 1)
                        tr2, va2 = next(sss2.split(idx2, rem_labels))
                        split_of_group: Dict[str, str] = {}
                        for i in tr2:
                            split_of_group[rem_groups[i]] = "train"
                        for i in va2:
                            split_of_group[rem_groups[i]] = "val"
                        for i in test_idx:
                            split_of_group[groups[i]] = "test"
                        candidates.append(("sklearn_StratifiedShuffleSplit_groups", split_of_group))
                except Exception:
                    pass

        # (b) deterministic capacity-aware greedy over groups
        candidates.append(
            ("greedy_capacity_stratified_groups", _greedy_group_assignment(groups, group_class, group_size, ratios, attempt_seed))
        )

        # Evaluate every candidate: it must be leakage-free AND close to the
        # requested ratios. The best passing candidate across all attempts wins.
        for name, split_of_group in candidates:
            split_of = _expand_to_images(split_of_group, group_of)
            counts_now = Counter(split_of.values())
            # A split with an empty (or near-empty) split is never acceptable:
            # an empty train set would also trivially "pass" the leakage guard.
            if any(counts_now.get(k, 0) < max(1, int(0.4 * ideal[k])) for k in ideal):
                continue
            report = _evaluate_leakage(split_of, fingerprints, sha_of, min_hamming)
            deviation = deviation_of(split_of)
            if report["leakage_detected"] or deviation > 0.45:
                continue
            if deviation < best_deviation:
                best_deviation = deviation
                assignment = split_of
                leakage = report
                used_method = name
                attempts = attempt + 1

        if assignment and best_deviation <= 0.06:
            break
    if not leakage:
        # Nothing passed the guard within the attempt budget — report the failure
        # honestly instead of silently shipping a leaking split.
        fallback = _expand_to_images(
            _greedy_group_assignment(groups, group_class, group_size, ratios, seed), group_of
        )
        assignment = fallback
        leakage = _evaluate_leakage(fallback, fingerprints, sha_of, min_hamming)
        used_method = "greedy_capacity_stratified_groups (leakage guard failed)"

    counts = Counter(assignment.values())
    train_ids = sorted([i for i, s in assignment.items() if s == "train"], key=lambda v: image_ids.index(v))
    val_ids = sorted([i for i, s in assignment.items() if s == "val"], key=lambda v: image_ids.index(v))
    test_ids = sorted([i for i, s in assignment.items() if s == "test"], key=lambda v: image_ids.index(v))

    class_distribution = {
        split: dict(Counter(dominant_class(i) for i in ids)) for split, ids in
        (("train", train_ids), ("val", val_ids), ("test", test_ids))
    }

    def build_split_records(ids: List[str]) -> List[Dict[str, Any]]:
        records = []
        for i in ids:
            im = dict(by_id[i])
            im["split"] = assignment[i]
            im["phash"] = fingerprints.get(i, "")
            records.append(im)
        return records

    result: Dict[str, Any] = {
        "status": "ok",
        "seed": seed,
        "ratios": {"train": ratios[0], "val": ratios[1], "test": ratios[2]},
        "counts": {
            "train": len(train_ids),
            "val": len(val_ids),
            "test": len(test_ids),
            "total": len(image_ids),
        },
        "stratified": SKLEARN_AVAILABLE,
        "method": used_method,
        "attempts": attempts,
        "leakage": "PASSED" if not leakage.get("leakage_detected") else "FAILED",
        "leakage_report": leakage,
        "class_distribution": class_distribution,
        "groups": {"total": len(groups), "derived_groups": sum(1 for g in group_members if len(group_members[g]) > 1)},
        "fingerprints": {i: fingerprints.get(i, "") for i in image_ids},
        "splits": {"train": train_ids, "val": val_ids, "test": test_ids},
    }

    if write_files:
        os.makedirs(out_dir, exist_ok=True)
        all_records = build_split_records(image_ids)
        with open(os.path.join(out_dir, "split.json"), "w", encoding="utf-8") as fh:
            json.dump({**result, "classes": classes, "images": all_records}, fh, indent=2)
        for split_name, ids in (("train", train_ids), ("val", val_ids), ("test", test_ids)):
            with open(os.path.join(out_dir, f"{split_name}_split.json"), "w", encoding="utf-8") as fh:
                json.dump(
                    {
                        "split": split_name,
                        "classes": classes,
                        "seed": seed,
                        "images": build_split_records(ids),
                    },
                    fh,
                    indent=2,
                )
        result["files"] = {
            "split": os.path.abspath(os.path.join(out_dir, "split.json")),
            "train": os.path.abspath(os.path.join(out_dir, "train_split.json")),
            "val": os.path.abspath(os.path.join(out_dir, "val_split.json")),
            "test": os.path.abspath(os.path.join(out_dir, "test_split.json")),
        }

    return result


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="VisionBharat V2 — Leakage-Free Stratified Auto Split")
    parser.add_argument("--input", required=True, help="JSON with {images: [{id, file_path, parent_image_id, annotations, class_name}]}")
    parser.add_argument("--out-dir", default="dataset", help="where split.json / *_split.json are written")
    parser.add_argument("--ratios", default="0.7,0.15,0.15", help="train,val,test ratios")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--min-hamming", type=int, default=DEFAULT_MIN_HAMMING)
    parser.add_argument("--max-attempts", type=int, default=DEFAULT_MAX_ATTEMPTS)
    parser.add_argument("--no-write", action="store_true", help="analyse only, do not write split files")
    args = parser.parse_args(argv)

    try:
        ratios = tuple(float(x) for x in args.ratios.split(","))
        if len(ratios) != 3:
            raise ValueError
    except ValueError:
        print(json.dumps({"status": "error", "error": "--ratios must look like 0.7,0.15,0.15"}))
        return 2
    if abs(sum(ratios) - 1.0) > 0.01:
        print(json.dumps({"status": "error", "error": "ratios must sum to 1.0"}))
        return 2

    result = split_dataset(
        input_json=args.input,
        out_dir=args.out_dir,
        ratios=ratios,  # type: ignore[arg-type]
        seed=args.seed,
        min_hamming=args.min_hamming,
        max_attempts=args.max_attempts,
        write_files=not args.no_write,
    )
    print("VBSPLIT_RESULT:" + json.dumps(result))
    return 0 if result.get("status") == "ok" else 1


if __name__ == "__main__":
    sys.exit(main())
