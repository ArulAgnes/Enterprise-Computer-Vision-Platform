# Electron Windows Desktop Build Guide

## VisionBharat — DataGenesis 2026

---

## Installation (End Users)

1. Download `VisionBharat-Setup-1.0.0.exe`
2. Run installer
3. Launch VisionBharat from Start Menu or Desktop
4. Use application

**No developer tools required. No internet required after download.**

---

## What's Bundled

| Component | Details | Size |
|---|---|---|
| Electron | 35.7.5 (Chromium + Node.js) | ~243 MB |
| Next.js | 16.2.6 standalone server | ~1 GB (asar) |
| PostgreSQL | 17.0 via embedded-postgres | ~104 MB |
| Python | 3.11.9 embeddable | ~10 MB |
| PyTorch | 2.13.0+cpu | ~494 MB |
| OpenCV | 5.0.0 headless | ~44 MB |
| NumPy | 2.4.6 | ~13 MB |
| scikit-learn | 1.9.0 | ~8 MB |
| AI Scripts | train.py, evaluate.py, infer.py, model.py | ~20 KB |

**Installer size:** 581 MB  
**Installed size:** ~2.6 GB

---

## Architecture

```
VisionBharat-Setup-1.0.0.exe
  ↓ Install
  ↓
VisionBharat.exe (Electron main process)
  |
  +-- Start embedded PostgreSQL (port 5433)
  |   - Binaries: resources/app.asar.unpacked/node_modules/@embedded-postgres/
  |   - Data: %APPDATA%\VisionBharat\pgdata\
  |   - No runtime download — all binaries pre-bundled
  |
  +-- Start Next.js standalone server
  |   - Uses ELECTRON_RUN_AS_NODE=1
  |   - Connects to PostgreSQL on port 5433
  |
  +-- Start BrowserWindow
  |   - Loads http://127.0.0.1:PORT
  |
  +-- Python AI operations use bundled runtime
      - Path: resources/python-embed/python.exe
      - Packages: PyTorch, OpenCV, NumPy, etc.
      - No system Python required
```

---

## Security

- `contextIsolation: true` — Renderer cannot access Node.js APIs
- `nodeIntegration: false` — No Node.js in browser context
- Preload script provides limited, safe API via `contextBridge`
- Navigation restricted to localhost only
- External links open in system browser
- No credentials packaged (.env excluded)
- PostgreSQL listens only on 127.0.0.1:5433

---

## Data Storage

All mutable data stored in `%APPDATA%\VisionBharat\`:

```
%APPDATA%\VisionBharat\
├── pgdata\           # PostgreSQL data directory
├── logs\             # Application logs
├── uploads\          # Uploaded images
├── datasets\         # Dataset files
├── checkpoints\      # Model checkpoints
├── reports\          # Generated reports
├── exports\          # Exported files
├── backups\          # Database backups
└── standalone\       # Extracted Next.js server
```

---

## Environment Variables (Set by Electron Main Process)

| Variable | Purpose |
|---|---|
| `VISIONBHARAT_DATA_DIR` | Writable userData directory |
| `VISIONBHARAT_APP_DIR` | App installation directory |
| `VISIONBHARAT_PYTHON_DIR` | Bundled Python directory |
| `VISIONBHARAT_AI_DIR` | AI scripts directory |
| `DATABASE_URL` | PostgreSQL connection string |

---

## Build Instructions (Developers)

### Prerequisites
- Node.js 18+
- Windows 10+ x64

### Build Commands
```powershell
# Full build with Python runtime
npm run electron:full

# Build without Python bundling
npm run electron:dist

# Setup Python runtime only
npm run setup:python
```

### Build Artifacts
- `release/VisionBharat-Setup-1.0.0.exe` — NSIS installer
- `release/win-unpacked/` — Unpacked application

---

## Troubleshooting

### "Server Not Found"
Run `npm run build` before `electron-builder`. The standalone server must exist at `.next/standalone/server.js`.

### "PostgreSQL failed to become ready"
- Check `%APPDATA%\VisionBharat\logs\electron.log`
- Ensure port 5433 is not in use
- First launch initializes pgdata (no download needed)

### "Python not found" or training fails
- Run `npm run setup:python` to set up the Python runtime
- Ensure `python-embed/` directory exists before building
- Bundled Python is at `resources/python-embed/python.exe`

---

## Build Configuration Files

- `electron-builder.yml` — Packaging configuration
- `electron/main.js` — Electron main process
- `electron/postgres.js` — Embedded PostgreSQL manager
- `electron/init-db.js` — Database schema initialization
- `electron/preload.js` — Secure preload bridge
- `electron/prepare-standalone.js` — Build preparation
- `scripts/setup-python-runtime.js` — Python runtime setup
