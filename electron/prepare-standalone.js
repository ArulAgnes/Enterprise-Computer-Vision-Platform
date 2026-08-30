/**
 * VisionBharat — Electron Build Script
 * Copies Next.js standalone output, static assets, and ai/ scripts for Electron packaging.
 */

const fs = require("fs");
const path = require("path");

const STANDALONE_DIR = path.join(__dirname, "..", ".next", "standalone");
const STATIC_SRC = path.join(__dirname, "..", ".next", "static");
const STATIC_DST = path.join(STANDALONE_DIR, ".next", "static");
const AI_SRC = path.join(__dirname, "..", "ai");
const AI_DST = path.join(STANDALONE_DIR, "ai");

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

// Copy ai/ directory into standalone
if (fs.existsSync(AI_SRC)) {
  console.log("Copying ai/ -> .next/standalone/ai/");
  copyDir(AI_SRC, AI_DST);

  // Remove __pycache__ and .pyc files from the copy
  const pycacheDir = path.join(AI_DST, "__pycache__");
  if (fs.existsSync(pycacheDir)) {
    fs.rmSync(pycacheDir, { recursive: true, force: true });
  }
  console.log("AI scripts copied.");
} else {
  console.warn("WARNING: ai/ directory not found. AI features may not work.");
}

// Also copy python-embed/ if it exists
const PYTHON_EMBED_SRC = path.join(__dirname, "..", "python-embed");
const PYTHON_EMBED_DST = path.join(STANDALONE_DIR, "python-embed");
if (fs.existsSync(PYTHON_EMBED_SRC)) {
  console.log("Copying python-embed/ -> .next/standalone/python-embed/");
  copyDir(PYTHON_EMBED_SRC, PYTHON_EMBED_DST);
  console.log("Python embeddable runtime copied.");
} else {
  console.warn("WARNING: python-embed/ not found. Run 'npm run setup:python' first.");
}

// Remove sensitive files that should NOT be packaged in the installer
const sensitiveFiles = [
  ".env",
  "drizzle.config.json",
  ".env.local",
  ".env.development",
  ".env.production",
  "docker-compose.yml",
  "Dockerfile",
  "eslint.config.mjs",
  "postcss.config.mjs",
  "tsconfig.json",
  "tsconfig.tsbuildinfo",
  "package-lock.json",
  "_check.js",
];

for (const file of sensitiveFiles) {
  const filePath = path.join(STANDALONE_DIR, file);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log(`Removed sensitive file: ${file}`);
  }
}

// Also remove source directories that shouldn't be shipped
const removableDirs = ["src", "docs", "drizzle", "scripts"];
for (const dir of removableDirs) {
  const dirPath = path.join(STANDALONE_DIR, dir);
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
    console.log(`Removed directory: ${dir}/`);
  }
}

console.log("Electron packaging preparation complete.");
