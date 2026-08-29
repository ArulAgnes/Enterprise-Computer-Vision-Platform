# VisionBharat — DataGenesis 2026

## An India-Centric Dataset Engineering & From-Scratch Computer Vision Platform

**Competition:** DataGenesis 2026 National AI & Computer Vision Hackathon  
**Institution:** Ramco Institute of Technology, Rajapalayam  
**Project Lead:** Arul Maria Agnes  
**Email:** agnes915033@gmail.com

---

## Overview

VisionBharat is a complete end-to-end computer vision platform that demonstrates the full AI lifecycle:

**CAPTURE → CURATE → VALIDATE → TRAIN FROM SCRATCH → EVALUATE → DETECT → ANALYZE → EXPLAIN → DEPLOY → DOCUMENT**

We did NOT start with an AI model. **We started with the data.**

---

## Competition Compliance

| Requirement | Status | Details |
|---|---|---|
| **Dataset** | ✅ COMPLIANT | Original team-collected images only |
| **Pretrained weights** | ✅ COMPLIANT | NONE — Random initialization |
| **Transfer learning** | ✅ COMPLIANT | NONE |
| **External datasets** | ✅ COMPLIANT | NONE (No COCO, ImageNet, Kaggle, etc.) |
| **Foundation models** | ✅ COMPLIANT | NONE |
| **Model initialization** | ✅ COMPLIANT | Random (Kaiming/Normal distribution) |
| **Training** | ✅ COMPLIANT | From scratch on team-collected dataset |
| **Evaluation** | ✅ COMPLIANT | Held-out team-collected test set |

---

## Dataset: Traditional Indian Lamps & Ritual Objects

### Classes (Configurable)
1. Clay Diya
2. Brass Diya
3. Hanging Diya
4. Multi-wick Diya
5. Kuthu Vilakku (Traditional Brass Lamp)
6. Temple Bell
7. Incense Holder
8. Ritual Plate

### Expected Directory Structure
```
datasets/
├── raw/                    # Original collected images
├── processed/              # Processed images
├── images/
│   ├── train/              # Training images
│   ├── val/                # Validation images
│   └── test/               # Test images
├── labels/
│   ├── train/              # YOLO-format labels
│   ├── val/
│   └── test/
├── metadata/               # Image metadata
└── versions/               # Dataset version snapshots
```

### Annotation Format (YOLO)
```
class_id center_x center_y width height
```
All coordinates normalized to [0, 1].

---

## Architecture: Custom CNN Detector (2.67M Parameters)

### From Scratch — NO Pretrained Components

```
Input (640×640×3)
↓
Stem Conv (3→32, stride 2)          → 320×320×32
↓
Stage 1: Downsample (32→64) + Res   → 160×160×64
↓
Stage 2: Downsample (64→128) + Res  → 80×80×128
↓
Stage 3: Downsample (128→256) + Res → 40×40×256
↓
Feature Pyramid Network              → Multi-scale features (3 levels)
↓
Detection Heads (3 levels)           → Objectness + BBox + Class logits
```

### Loss Function (From First Principles)
```
L_total = λ_box · L_box + λ_obj · L_obj + λ_cls · L_cls

L_box = 1 - CIoU (Complete IoU)
L_obj = BCEWithLogitsLoss
L_cls = BCEWithLogitsLoss
```

### Initialization
- **Conv weights:** Kaiming Normal (mode=fan_out, nonlinearity=leaky_relu)
- **BatchNorm:** weight=1, bias=0
- **Detection head:** Normal(0, 0.01)
- **NO pretrained weights loaded at any point**

---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript 5.9, Tailwind CSS 4 |
| UI Components | Lucide React, Recharts |
| Backend | Next.js API Routes (17 endpoints) |
| Database | PostgreSQL + Drizzle ORM (16 tables) |
| AI/ML | Python 3.11, PyTorch 2.13, NumPy, OpenCV, Pillow |
| Desktop | Electron 35, electron-builder 26 (Windows NSIS installer) |

---

## Project Structure

```
VisionBharat/
├── src/
│   ├── app/
│   │   ├── (platform)/          # 17 pages (dashboard, capture, annotation, etc.)
│   │   └── api/                 # 17 API endpoints
│   │       ├── upload/          # Image upload with SHA-256 + metadata
│   │       ├── quality/         # Quality analysis engine
│   │       ├── duplicates/      # Duplicate detection
│   │       ├── annotations/     # Annotation CRUD
│   │       ├── split/           # Dataset splitting
│   │       ├── versions/        # Dataset versioning
│   │       ├── analytics/       # Dataset analytics
│   │       ├── training/        # Training experiments
│   │       ├── inference/       # Inference recording
│   │       ├── evaluation/      # Evaluation metrics
│   │       ├── models/          # Model registry
│   │       ├── reports/         # Report generation
│   │       ├── classes/         # Class management
│   │       ├── datasets/        # Dataset CRUD
│   │       ├── images/          # Image listing
│   │       ├── experiments/     # Experiment CRUD
│   │       └── health/          # Health check
│   ├── components/              # Shared components
│   ├── lib/                     # Utilities (hooks, API, hash, paths)
│   └── db/                      # Drizzle ORM schema + connection
├── ai/
│   ├── model.py                 # Custom CNN (2.67M params, from scratch)
│   ├── train.py                 # Training pipeline with real loss
│   ├── evaluate.py              # Evaluation engine
│   ├── test_model.py            # Model smoke tests
│   └── requirements.txt
├── datasets/                    # Dataset storage
├── uploads/                     # Uploaded images
├── checkpoints/                 # Model checkpoints
├── reports/                     # Generated reports
├── logs/                        # Training logs
└── docs/                        # Documentation
```

---

## Getting Started

### 1. Install Dependencies
```powershell
cd VisionBharat
npm install
```

### 2. Setup Database
```powershell
# Ensure PostgreSQL is running
# Copy .env.example to .env and configure DATABASE_URL
npx drizzle-kit push
```

### 3. Start Frontend
```powershell
npm run dev
```
Frontend runs at http://localhost:3000

### 4. Desktop Application (Electron)
```powershell
# Build and package as Windows EXE
npm run electron:dist

# Or development mode
npm run electron:dev
```
See [ELECTRON_WINDOWS_BUILD.md](ELECTRON_WINDOWS_BUILD.md) for details.

### 4. Python Environment
```powershell
cd ai
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

### 5. Run Model Tests
```powershell
cd ai
python test_model.py
```

### 6. Training
```powershell
cd ai
python train.py --dataset_root ../datasets --epochs 100 --batch_size 16
```

### 7. Evaluation
```powershell
cd ai
python evaluate.py
```

---

## API Endpoints

| Endpoint | Methods | Description |
|---|---|---|
| `/api/health` | GET | Database health check |
| `/api/datasets` | GET, POST | List/create datasets |
| `/api/datasets/[id]` | GET, DELETE | Get/delete dataset |
| `/api/upload` | POST | Upload images (multipart) |
| `/api/images` | GET, POST | List/create image records |
| `/api/quality` | GET, POST | Quality analysis |
| `/api/duplicates` | GET, POST | Duplicate detection |
| `/api/annotations` | GET, POST, PUT, DELETE | Annotation CRUD |
| `/api/classes` | GET, POST | Class management |
| `/api/split` | GET, POST | Dataset splitting |
| `/api/versions` | GET, POST | Dataset versioning |
| `/api/analytics` | GET | Dataset analytics |
| `/api/training` | GET, POST, PUT | Training experiments |
| `/api/models` | GET, POST, PUT | Model registry |
| `/api/evaluation` | GET, POST | Evaluation metrics |
| `/api/inference` | GET, POST | Inference runs |
| `/api/reports` | GET, POST | Report generation |
| `/api/experiments` | GET, POST | Experiment tracking |

---

## Key Features

### Dataset Engineering
- Image upload with drag-and-drop, batch upload
- SHA-256 hash + perceptual hash computation
- Real quality analysis (brightness, contrast, blur, entropy, noise)
- Duplicate detection (exact + near-duplicate)
- Interactive annotation editor with bounding boxes
- Annotation validation with health scoring
- Deterministic dataset splitting (train/val/test) with leakage detection
- Dataset versioning with reproducible snapshots
- Dynamic class management

### AI & Training
- Custom CNN architecture (2.67M parameters, from scratch)
- Real CIoU + BCE loss with target assignment
- Training pipeline with CPU/CUDA support
- Checkpoint management (best + latest)
- Experiment tracking with metrics history

### Evaluation & Analysis
- IoU, Precision, Recall, F1 metrics
- Per-class metrics and confusion matrix
- Error categorization (TP, FP, FN, localization, classification)
- Confidence threshold analysis

### Reports & Export
- Auto-generated Dataset Card (Markdown)
- Auto-generated Model Card (Markdown)
- Research report generation
- YOLO-compatible export format

---

## Implementation Status

### Fully Implemented (Real Backend)
- ✅ All 17 frontend pages with real API integration
- ✅ All 17 API endpoints with real database operations
- ✅ Image upload with physical file storage + SHA-256 + metadata
- ✅ Quality analysis engine (brightness, contrast, blur, entropy, noise)
- ✅ Duplicate detection (SHA-256 exact + perceptual hash near-duplicate)
- ✅ Annotation editor with drawing, saving, loading
- ✅ Dataset splitting with deterministic seed + leakage detection
- ✅ Dataset versioning
- ✅ Dataset analytics from real database records
- ✅ Training experiment management
- ✅ Model registry with from-scratch verification
- ✅ Evaluation metrics storage
- ✅ Report generation (Dataset Card, Model Card, Research Report)
- ✅ Custom CNN architecture (from scratch, 2.67M params)
- ✅ Real detection loss (CIoU + BCE with target assignment)
- ✅ Training pipeline with checkpoint management
- ✅ Python model smoke tests (all passing)

### Environment Dependent
- CUDA GPU training (CPU mode available)
- Webcam capture (requires browser permissions)
- PostgreSQL database (required for all features)

### Not Implemented
- Kaggle authenticated upload (export package available)
- Docker deployment configuration

---

## Why We Are Different

1. **We created the data.** Not merely downloaded a dataset.
2. **We engineered data quality.** Real duplicate detection, quality scoring, annotation validation.
3. **We built the model.** Random initialization and training from scratch.
4. **We measured failures.** Error analysis instead of showing only successful predictions.
5. **We made it reproducible.** Dataset versions, seeds, configurations, experiment tracking.
6. **We designed for India.** Traditional Indian Lamps & Ritual Objects dataset.

---

## Credits

**Project Lead / Developer:** Arul Maria Agnes  
**Institution:** Ramco Institute of Technology, Rajapalayam  
**Competition:** DataGenesis 2026 National AI & Computer Vision Hackathon

---

*Built with technical rigor. No fake metrics. No pretrained weights. From scratch.*
