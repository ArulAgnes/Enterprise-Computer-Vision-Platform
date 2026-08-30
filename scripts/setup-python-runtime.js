/**
 * VisionBharat — Python Embedded Runtime Setup
 * Downloads Python embeddable package and installs required dependencies.
 * Run this script before building the Electron app.
 *
 * Usage: node scripts/setup-python-runtime.js
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const https = require("https");
const http = require("http");

const PYTHON_VERSION = "3.11.9";
const PYTHON_EMBED_URL = `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip`;
const PYTHON_EMBED_DIR = path.join(__dirname, "..", "python-embed");
const REQUIREMENTS = path.join(__dirname, "..", "ai", "requirements.txt");
const GET_PIP_URL = "https://bootstrap.pypa.io/get-pip.py";

function log(msg) {
  console.log(`[Python Setup] ${msg}`);
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const protocol = url.startsWith("https") ? https : http;

    protocol
      .get(url, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          downloadFile(response.headers.location, dest).then(resolve).catch(reject);
          return;
        }
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode} for ${url}`));
          return;
        }
        response.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve();
        });
      })
      .on("error", (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
  });
}

function run(cmd, opts = {}) {
  log(`Running: ${cmd}`);
  return execSync(cmd, { stdio: "inherit", ...opts });
}

async function main() {
  log("Setting up Python embedded runtime for VisionBharat...");

  // Step 1: Clean and create directory
  if (fs.existsSync(PYTHON_EMBED_DIR)) {
    log("Cleaning existing python-embed directory...");
    fs.rmSync(PYTHON_EMBED_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(PYTHON_EMBED_DIR, { recursive: true });

  // Step 2: Download Python embeddable
  const zipPath = path.join(PYTHON_EMBED_DIR, "python-embed.zip");
  log(`Downloading Python ${PYTHON_VERSION} embeddable package...`);
  await downloadFile(PYTHON_EMBED_URL, zipPath);

  // Step 3: Extract
  log("Extracting Python embeddable package...");
  run(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${PYTHON_EMBED_DIR}' -Force"`);
  fs.unlinkSync(zipPath);

  // Step 4: Enable pip by uncommenting import line in python311._pth
  const pthFile = path.join(PYTHON_EMBED_DIR, `python${PYTHON_VERSION.replace(/\./g, "")}._pth`);
  if (fs.existsSync(pthFile)) {
    let content = fs.readFileSync(pthFile, "utf-8");
    content = content.replace(/^#import\s+site/m, "import site");
    fs.writeFileSync(pthFile, content);
    log("Enabled site-packages in ._pth file");
  }

  // Step 5: Download get-pip.py
  const getPipPath = path.join(PYTHON_EMBED_DIR, "get-pip.py");
  log("Downloading get-pip.py...");
  await downloadFile(GET_PIP_URL, getPipPath);

  // Step 6: Install pip
  log("Installing pip...");
  const pythonExe = path.join(PYTHON_EMBED_DIR, "python.exe");
  run(`"${pythonExe}" "${getPipPath}" --no-warn-script-location`);
  fs.unlinkSync(getPipPath);

  // Step 7: Install dependencies from requirements.txt
  if (fs.existsSync(REQUIREMENTS)) {
    log("Installing Python dependencies from requirements.txt...");
    // Filter out problematic packages for embeddable Python
    const reqContent = fs.readFileSync(REQUIREMENTS, "utf-8");
    const filteredReqs = reqContent
      .split("\n")
      .filter((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return true;
        // Skip tensorboard (heavy, optional)
        if (trimmed.toLowerCase().includes("tensorboard")) return false;
        return true;
      })
      .join("\n");

    const filteredReqPath = path.join(PYTHON_EMBED_DIR, "requirements-filtered.txt");
    fs.writeFileSync(filteredReqPath, filteredReqs);

    run(`"${pythonExe}" -m pip install -r "${filteredReqPath}" --no-warn-script-location`, {
      timeout: 600000,
    });
    fs.unlinkSync(filteredReqPath);
  }

  // Step 8: Create a sitecustomize.py to handle路径 issues
  const siteCustomize = path.join(PYTHON_EMBED_DIR, "sitecustomize.py");
  fs.writeFileSync(
    siteCustomize,
    `"""VisionBharat Python Runtime - Site Customization"""
import sys
import os

# Ensure the ai/ directory is on the path
app_dir = os.environ.get("VISIONBHARAT_APP_DIR", "")
if app_dir:
    ai_dir = os.path.join(app_dir, "ai")
    if ai_dir not in sys.path:
        sys.path.insert(0, ai_dir)
`
  );

  log("Python embedded runtime setup complete!");
  log(`Python location: ${pythonExe}`);

  // Verify installation
  log("Verifying installation...");
  try {
    run(`"${pythonExe}" -c "import torch; print(f'PyTorch {torch.__version__} OK')"`);
    run(`"${pythonExe}" -c "import cv2; print(f'OpenCV {cv2.__version__} OK')"`);
    run(`"${pythonExe}" -c "import numpy; print(f'NumPy {numpy.__version__} OK')"`);
  } catch (e) {
    log("WARNING: Some packages may not have installed correctly");
  }
}

main().catch((err) => {
  console.error("[Python Setup] FAILED:", err);
  process.exit(1);
});
