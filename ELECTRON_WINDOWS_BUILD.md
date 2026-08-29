# Electron Windows Desktop Build Guide

## VisionBharat — DataGenesis 2026

This document describes how to build and run VisionBharat as a Windows desktop application using Electron.

---

## Prerequisites

- **Node.js** 18+ (LTS recommended)
- **PostgreSQL** 14+ running on localhost:5432
- **Windows 10+** (x64)
- **Python 3.11+** (for AI training features)

## Quick Start

### Development

```powershell
# Install dependencies
npm install

# Start Next.js dev server
npm run dev

# In another terminal, start Electron (connects to dev server)
npm run electron:dev
```

### Production Build

```powershell
# Build Next.js + Package as Windows EXE
npm run electron:dist

# Or step by step:
npm run build                           # Build Next.js standalone
node electron/prepare-standalone.js     # Prepare static assets
npx electron-builder --win              # Package as Windows installer
```

The installer will be created at:
```
release\VisionBharat-Setup-1.0.0.exe
```

---

## Architecture

```
Electron Main Process (electron/main.js)
    |
    +-- Starts Next.js standalone server as child process
    |   (uses ELECTRON_RUN_AS_NODE=1 to leverage Electron's Node.js)
    |
    +-- Waits for HTTP health check on localhost:PORT
    |
    +-- Creates BrowserWindow pointing to http://127.0.0.1:PORT
    |
    +-- On quit: kills the server process gracefully
```

### Security

- `contextIsolation: true` — Renderer cannot access Node.js APIs
- `nodeIntegration: false` — No Node.js in browser context
- Preload script provides limited, safe API via `contextBridge`
- Navigation restricted to localhost only
- External links open in system browser

### Data Storage

In the packaged application, mutable data is stored in:
```
%APPDATA%\VisionBharat\
├── logs\           # Application logs
├── uploads\        # Uploaded images
├── datasets\       # Dataset files
├── checkpoints\    # Model checkpoints
├── reports\        # Generated reports
└── standalone\     # Extracted Next.js server
```

### Database

Requires PostgreSQL running on localhost:5432. The connection string is:
```
DATABASE_URL="postgresql://postgres:password@127.0.0.1:5432/visionbharat1"
```

Set via environment variable or edit the DATABASE_URL in `electron/main.js`.

---

## Build Configuration

- **electron-builder.yml** — Packaging configuration
- **electron/main.js** — Electron main process
- **electron/preload.js** — Secure preload bridge
- **electron/prepare-standalone.js** — Static asset preparation

---

## Troubleshooting

### "Server Not Found"
Ensure `npm run build` was run before `electron-builder`. The standalone server must exist at `.next/standalone/server.js`.

### "Database not connected"
Ensure PostgreSQL is running and accessible at localhost:5432.

### Large EXE size (~360MB)
This is expected. The EXE includes Electron runtime (~150MB), Next.js standalone, and Node.js modules.

### Slow first launch
The first launch extracts the standalone server from the ASAR archive to `%APPDATA%\VisionBharat\standalone\`. Subsequent launches reuse the cached version.
