/**
 * VisionBharat — Electron Build Script
 * Copies Next.js standalone output and static assets for Electron packaging.
 */

const fs = require("fs");
const path = require("path");

const STANDALONE_DIR = path.join(__dirname, "..", ".next", "standalone");
const STATIC_SRC = path.join(__dirname, "..", ".next", "static");
const STATIC_DST = path.join(STANDALONE_DIR, ".next", "static");

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

console.log("Packaging Next.js standalone for Electron...");

// Verify standalone output exists
if (!fs.existsSync(path.join(STANDALONE_DIR, "server.js"))) {
  console.error("ERROR: .next/standalone/server.js not found. Run 'npm run build' first.");
  process.exit(1);
}

// Copy static files
if (fs.existsSync(STATIC_SRC)) {
  console.log("Copying .next/static -> .next/standalone/.next/static");
  copyDir(STATIC_SRC, STATIC_DST);
  console.log("Static assets copied.");
} else {
  console.warn("WARNING: .next/static not found. Static assets may not load.");
}

// Ensure runtime directories exist in standalone
const runtimeDirs = ["uploads", "datasets", "checkpoints", "reports", "logs", "exports"];
for (const dir of runtimeDirs) {
  const target = path.join(STANDALONE_DIR, dir);
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }
}

console.log("Electron packaging preparation complete.");
