"""
VisionBharat — Human Detection Baseline Initialization
=======================================================
Automatically creates a dataset from existing human images.

This script:
1. Inspects the existing images in datasets/images/train/
2. Creates a dataset via the backend API
3. Imports/registers all images
4. Creates the 'person' class
5. Runs quality checks
6. Creates a deterministic train/val/test split
7. Creates a dataset version
8. Reports the current state

ANNOTATION STATUS:
- The existing human images have NO bounding-box annotations
- Training requires annotations to be provided
- This script makes the dataset ready for the annotation workflow

Project: VisionBharat — DataGenesis 2026
"""

import os
import sys
import json
import hashlib
import shutil
import time
import urllib.request
import urllib.error
from pathlib import Path
from datetime import datetime

BASE_URL = "http://localhost:3000"
DATASET_SOURCE = Path(__file__).parent.parent / "datasets" / "images" / "train"
UPLOADS_DIR = Path(__file__).parent.parent / "uploads"


def api_get(path):
    """GET request to API"""
    url = f"{BASE_URL}{path}"
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        print(f"  API GET error: {e}")
        return None


def api_post(path, data):
    """POST request to API"""
    url = f"{BASE_URL}{path}"
    body = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"  API POST error {e.code}: {body}")
        return None
    except Exception as e:
        print(f"  API POST error: {e}")
        return None


def api_delete(path):
    """DELETE request to API"""
    url = f"{BASE_URL}{path}"
    req = urllib.request.Request(url, method="DELETE")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        print(f"  API DELETE error: {e}")
        return None


def inspect_images():
    """Inspect the existing human images"""
    print("\n[1] Inspecting images...")
    
    if not DATASET_SOURCE.exists():
        print(f"  ERROR: Image directory not found: {DATASET_SOURCE}")
        return None
    
    all_files = sorted(os.listdir(DATASET_SOURCE))
    png_files = [f for f in all_files if f.lower().endswith(".png")]
    
    print(f"  Total PNG files: {len(png_files)}")
    
    valid_images = []
    corrupt_images = []
    small_images = []
    
    for fname in png_files:
        fpath = DATASET_SOURCE / fname
        size = fpath.stat().st_size
        if size < 100:
            corrupt_images.append(fname)
            continue
        valid_images.append({"name": fname, "path": str(fpath), "size": size})
    
    print(f"  Valid images: {len(valid_images)}")
    if corrupt_images:
        print(f"  Corrupt/empty: {len(corrupt_images)}")
    
    return {
        "total": len(png_files),
        "valid": len(valid_images),
        "corrupt": len(corrupt_images),
        "images": valid_images,
        "corrupt_list": corrupt_images,
    }


def check_existing_dataset():
    """Check if Human Detection Baseline already exists"""
    print("\n[2] Checking for existing dataset...")
    datasets = api_get("/api/datasets")
    if not datasets or not isinstance(datasets, list):
        print("  No datasets found or API error")
        return None
    
    for ds in datasets:
        if "human" in ds.get("name", "").lower() and "baseline" in ds.get("name", "").lower():
            print(f"  Found existing: {ds['name']} (ID: {ds['id']})")
            return ds
    
    print("  No existing Human Detection Baseline dataset")
    return None


def create_dataset():
    """Create the Human Detection Baseline dataset"""
    print("\n[3] Creating dataset...")
    result = api_post("/api/datasets", {
        "name": "Human Detection Baseline",
        "theme": "Person Detection — DataGenesis 2026",
        "description": "Human images for person detection model training. 559 team-collected images.",
        "collectionLocation": "Team Collected",
    })
    if result and result.get("id"):
        print(f"  Created: {result['name']} (ID: {result['id']})")
        return result
    print("  Failed to create dataset")
    return None


def import_images(dataset_id):
    """Import existing images into the dataset"""
    print(f"\n[4] Importing images into dataset {dataset_id}...")
    
    existing = api_get(f"/api/images?datasetId={dataset_id}&limit=1000")
    existing_names = set()
    if existing and isinstance(existing, list):
        existing_names = {img.get("originalFilename", img.get("filename", "")) for img in existing}
    elif existing and isinstance(existing, dict):
        existing_names = {img.get("originalFilename", img.get("filename", "")) for img in existing.get("data", existing.get("images", []))}
    
    print(f"  Already imported: {len(existing_names)}")
    
    import_dir = UPLOADS_DIR / dataset_id
    import_dir.mkdir(parents=True, exist_ok=True)
    
    all_files = sorted(os.listdir(DATASET_SOURCE))
    png_files = [f for f in all_files if f.lower().endswith(".png") and f not in existing_names]
    
    if not png_files:
        print("  All images already imported")
        return len(existing_names)
    
    print(f"  Importing {len(png_files)} new images...")
    
    imported = 0
    errors = 0
    batch_size = 10
    
    for i in range(0, len(png_files), batch_size):
        batch = png_files[i:i+batch_size]
        for fname in batch:
            src = DATASET_SOURCE / fname
            dst = import_dir / fname
            try:
                shutil.copy2(str(src), str(dst))
                
                sha256 = hashlib.sha256(src.read_bytes()).hexdigest()
                
                from PIL import Image
                img = Image.open(str(src))
                width, height = img.size
                img.close()
                
                api_post("/api/images", {
                    "datasetId": dataset_id,
                    "filename": fname,
                    "originalFilename": fname,
                    "filepath": str(dst),
                    "width": width,
                    "height": height,
                    "resolution": f"{width}x{height}",
                    "fileSize": src.stat().st_size,
                    "mimeType": "image/png",
                    "imageHash": sha256,
                })
                imported += 1
            except Exception as e:
                print(f"  Error importing {fname}: {e}")
                errors += 1
        
        if (i + batch_size) % 50 == 0:
            print(f"  Progress: {min(i + batch_size, len(png_files))}/{len(png_files)}")
    
    print(f"  Imported: {imported}, Errors: {errors}")
    return imported + len(existing_names)


def create_class(dataset_id):
    """Create the person class"""
    print("\n[5] Creating person class...")
    
    existing = api_get(f"/api/classes?datasetId={dataset_id}")
    classes_list = []
    if existing and isinstance(existing, dict):
        classes_list = existing.get("classes", [])
    elif existing and isinstance(existing, list):
        classes_list = existing
    
    if classes_list:
        print(f"  Classes already exist: {len(classes_list)}")
        return classes_list[0] if classes_list else None
    
    result = api_post("/api/classes", {
        "datasetId": dataset_id,
        "name": "person",
        "classIndex": 0,
        "description": "Human person — full body or upper body visible",
        "color": "#10b981",
    })
    if result:
        print(f"  Created class: person (index 0)")
        return result.get("class", result)
    print("  Failed to create class")
    return None


def run_quality_checks(dataset_id):
    """Run quality checks on all images"""
    print("\n[6] Running quality checks...")
    result = api_post("/api/quality", {"datasetId": dataset_id})
    if result:
        analyzed = result.get("analyzed", 0)
        print(f"  Analyzed: {analyzed} images")
        results = result.get("results", [])
        green = sum(1 for r in results if r.get("qualityFlag") == "green")
        yellow = sum(1 for r in results if r.get("qualityFlag") == "yellow")
        red = sum(1 for r in results if r.get("qualityFlag") == "red")
        print(f"  Green: {green}, Yellow: {yellow}, Red: {red}")
        return result
    print("  Quality check failed")
    return None


def create_split(dataset_id, total_images):
    """Create train/val/test split"""
    print("\n[7] Creating dataset split...")
    
    existing = api_get(f"/api/split?datasetId={dataset_id}")
    if existing and isinstance(existing, dict) and existing.get("splits"):
        print("  Split already exists")
        return existing
    
    result = api_post("/api/split", {
        "datasetId": dataset_id,
        "trainRatio": 0.70,
        "valRatio": 0.15,
        "testRatio": 0.15,
        "seed": 42,
    })
    if result:
        print(f"  Split created: Train={result.get('trainCount')}, Val={result.get('valCount')}, Test={result.get('testCount')}")
        if result.get("leakageDetected"):
            print(f"  WARNING: Leakage detected: {result.get('leakageDetails')}")
        return result
    print("  Split failed")
    return None


def create_version(dataset_id):
    """Create a dataset version snapshot"""
    print("\n[8] Creating dataset version...")
    result = api_post("/api/versions", {
        "datasetId": dataset_id,
        "changeDescription": "Initial import — 559 human images, person class, quality checked, split configured",
    })
    if result:
        version = result.get("version", {})
        snapshot = result.get("snapshot", {})
        print(f"  Version: {version.get('version', '?')}")
        print(f"  Snapshot: {snapshot}")
        return result
    print("  Version creation failed")
    return None


def report_state(dataset_id):
    """Report the current state of the dataset"""
    print("\n" + "=" * 60)
    print("BASELINE DATASET STATE REPORT")
    print("=" * 60)
    
    datasets = api_get("/api/datasets")
    ds = None
    if datasets and isinstance(datasets, list):
        for d in datasets:
            if d["id"] == dataset_id:
                ds = d
                break
    
    if ds:
        print(f"  Dataset: {ds.get('name')}")
        print(f"  ID: {ds.get('datasetId', ds.get('id'))}")
        print(f"  Images: {ds.get('imageCount', 0)}")
        print(f"  Annotated: {ds.get('annotatedCount', 0)}")
        print(f"  Classes: {ds.get('classCount', 0)}")
        print(f"  Coverage: {ds.get('coverage', 0)}%")
        print(f"  Version: {ds.get('version', 'N/A')}")
    
    classes = api_get(f"/api/classes?datasetId={dataset_id}")
    if classes and isinstance(classes, dict):
        cls_list = classes.get("classes", [])
        print(f"  Classes defined: {len(cls_list)}")
        for c in cls_list:
            print(f"    - {c.get('name')} (index: {c.get('classIndex')})")
    
    versions = api_get(f"/api/versions?datasetId={dataset_id}")
    if versions and isinstance(versions, dict):
        v_list = versions.get("versions", [])
        print(f"  Versions: {len(v_list)}")
        for v in v_list:
            print(f"    - {v.get('version')}: {v.get('changeDescription', '')}")
    
    print("\n  ANNOTATION STATUS: NO ANNOTATIONS FOUND")
    print("  TRAINING STATUS: BLOCKED — annotations required")
    print("  NEXT ACTION: Annotate images in /annotation")
    print("=" * 60)


def main():
    print("=" * 60)
    print("VISIONBHARAT — HUMAN DETECTION BASELINE INITIALIZATION")
    print("=" * 60)
    print(f"Time: {datetime.now().isoformat()}")
    print(f"Image source: {DATASET_SOURCE}")
    
    # Step 1: Inspect images
    inspection = inspect_images()
    if not inspection or inspection["valid"] == 0:
        print("\nFATAL: No valid images found")
        sys.exit(1)
    
    # Step 2: Check for existing dataset
    existing_ds = check_existing_dataset()
    
    if existing_ds:
        dataset_id = existing_ds["id"]
        print(f"\nReusing existing dataset: {dataset_id}")
    else:
        # Step 3: Create dataset
        ds = create_dataset()
        if not ds:
            print("\nFATAL: Could not create dataset")
            sys.exit(1)
        dataset_id = ds["id"]
    
    # Step 4: Import images
    count = import_images(dataset_id)
    print(f"\n  Total images in dataset: {count}")
    
    # Step 5: Create class
    create_class(dataset_id)
    
    # Step 6: Quality checks
    run_quality_checks(dataset_id)
    
    # Step 7: Split
    create_split(dataset_id, count)
    
    # Step 8: Version
    create_version(dataset_id)
    
    # Step 9: Report
    report_state(dataset_id)
    
    print("\nInitialization complete.")
    print("Next steps:")
    print("  1. Open /annotation to annotate images")
    print("  2. After annotations, training can proceed")
    print("  3. Use /training to start model training")


if __name__ == "__main__":
    main()
