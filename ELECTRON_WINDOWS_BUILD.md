# Electron Windows Desktop Build Guide

## VisionBharat — DataGenesis 2026

This document describes how to build and run VisionBharat as a self-contained Windows desktop application using Electron with embedded PostgreSQL.

---

## Quick Start (No Prerequisites!)

**End users do NOT need Node.js, Python, PostgreSQL, or any development tools.**

Simply run the installer:
```
release\VisionBharat-Setup-1.0.0.exe
```

The app will:
1. Install to your chosen directory
2. On first launch, initialize an embedded PostgreSQL database
3. Start the Next.js server automatically
4. Open the VisionBharat application

---

## For Developers

### Prerequisites

- **Node.js** 18+ (LTS recommended)
- **Windows 10+** (x64)

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
```

The installer will be created at:
```
release\VisionBharat-Setup-1.0.0.exe
```

---

## Architecture

### Self-Contained Design

The packaged application is fully self-contained. No external services are required.

```
Electron Main Process (electron/main.js)
    |
    +-- Step 1: Initialize Embedded PostgreSQL
    |   (electron/postgres.js)
    |   - Downloads PostgreSQL binaries on first run (~50MB)
    |   - Creates database in %APPDATA%\VisionBharat\pgdata\
    |   - Initializes schema with all 17 tables
    |
    +-- Step 2: Start Next.js standalone server
    |   - Uses ELECTRON_RUN_AS_NODE=1
    |   - Connects to embedded PostgreSQL on port 5433
    |
    +-- Step 3: Create BrowserWindow
    |   - Points to http://127.0.0.1:PORT
    |
    +-- On quit: stops Next.js server, then PostgreSQL
```

### Embedded PostgreSQL

- **Engine**: PostgreSQL 18 via `embedded-postgres` npm package
- **Port**: 5433 (avoids conflict with system PostgreSQL on 5432)
- **Database**: `visionbharat`
- **Data directory**: `%APPDATA%\VisionBharat\pgdata\`
- **First run**: Downloads PostgreSQL binaries from EDB (~50MB)
- **Subsequent runs**: Uses cached binaries

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

## Backup & Restore

The application provides database backup/restore through the Electron API:

```javascript
// Backup
await window.electronAPI.backupDatabase();

// Restore
await window.electronAPI.restoreDatabase();
```

Backups are stored as SQL dump files in `%APPDATA%\VisionBharat\backups\`.

---

## Build Configuration

- **electron-builder.yml** — Packaging configuration
- **electron/main.js** — Electron main process (PostgreSQL + Next.js lifecycle)
- **electron/postgres.js** — Embedded PostgreSQL manager
- **electron/init-db.js** — Database schema initialization
- **electron/preload.js** — Secure preload bridge
- **electron/prepare-standalone.js** — Static asset preparation

---

## Troubleshooting

### "Server Not Found"
Ensure `npm run build` was run before `electron-builder`. The standalone server must exist at `.next/standalone/server.js`.

### "PostgreSQL failed to become ready"
- Check `%APPDATA%\VisionBharat\logs\electron.log` for details
- Ensure port 5433 is not in use by another application
- The first launch may take 1-2 minutes to download PostgreSQL binaries

### First launch is slow
The first launch downloads PostgreSQL binaries (~50MB) from EDB. Subsequent launches use the cached binaries and start in seconds.

### EXE size (~170MB)
This includes:
- Electron runtime (~150MB)
- Next.js standalone server
- Embedded PostgreSQL binaries (~100MB unpacked)
- Node.js modules (pg, embedded-postgres, etc.)

### Conflicts with existing PostgreSQL
The embedded PostgreSQL runs on port 5433 (not 5432), so it won't conflict with a system PostgreSQL installation.
