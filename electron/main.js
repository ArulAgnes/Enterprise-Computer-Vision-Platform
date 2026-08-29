const { app, BrowserWindow, shell, dialog, ipcMain } = require("electron");
const path = require("path");
const { spawn, execSync } = require("child_process");
const net = require("net");
const fs = require("fs");

// ============================================================
// VisionBharat — Electron Main Process
// ============================================================

let mainWindow = null;
let nextServerProcess = null;
let serverPort = 3000;
const SERVER_STARTUP_TIMEOUT = 60000; // 60 seconds
const HEALTH_CHECK_INTERVAL = 1000;

// ============================================================
// Paths
// ============================================================
const APP_NAME = "VisionBharat";
const USER_DATA_PATH = app.getPath("userData");
const LOGS_DIR = path.join(USER_DATA_PATH, "logs");
const DATASETS_DIR = path.join(USER_DATA_PATH, "datasets");
const UPLOADS_DIR = path.join(USER_DATA_PATH, "uploads");
const CHECKPOINTS_DIR = path.join(USER_DATA_PATH, "checkpoints");
const REPORTS_DIR = path.join(USER_DATA_PATH, "reports");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function log(level, message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level}] ${message}`;
  console.log(line);
  try {
    ensureDir(LOGS_DIR);
    fs.appendFileSync(path.join(LOGS_DIR, "electron.log"), line + "\n");
  } catch {
    // ignore log write failures
  }
}

// ============================================================
// Security: Content Security Policy
// ============================================================
const CSP = [
  "default-src 'self' http://localhost:* http://127.0.0.1:*",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline' http://localhost:*",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: http://localhost:*",
  "connect-src 'self' http://localhost:*",
  "media-src 'self'",
  "object-src 'none'",
  "frame-src 'none'",
].join("; ");

// ============================================================
// Port Detection
// ============================================================
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, "127.0.0.1");
    server.on("listening", () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort) {
  let port = startPort;
  while (port < startPort + 100) {
    if (await isPortAvailable(port)) return port;
    port++;
  }
  throw new Error("No available port found");
}

// ============================================================
// Find Next.js standalone server
// ============================================================
function findNextServerSource() {
  // Returns the path to server.js inside the asar (readable via Electron's patched fs)
  const candidates = [];

  if (app.isPackaged) {
    candidates.push(path.join(app.getAppPath(), ".next", "standalone", "server.js"));
  } else {
    candidates.push(path.join(__dirname, "..", ".next", "standalone", "server.js"));
  }

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {
      // fs.existsSync may throw on some paths
    }
  }

  return null;
}

// ============================================================
// Copy directory from asar to writable location
// ============================================================
function copyFromAsar(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyFromAsar(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ============================================================
// Prepare standalone server for execution
// ============================================================
function prepareStandaloneServer() {
  const sourcePath = findNextServerSource();
  if (!sourcePath) return null;

  const sourceDir = path.dirname(sourcePath);
  const destDir = path.join(USER_DATA_PATH, "standalone");
  const destPath = path.join(destDir, "server.js");

  // Check if already prepared and up-to-date
  if (fs.existsSync(destPath)) {
    try {
      const sourceStat = fs.statSync(sourcePath);
      const destStat = fs.statSync(destPath);
      if (sourceStat.mtimeMs <= destStat.mtimeMs) {
        log("INFO", "Standalone server already up-to-date");
        return destPath;
      }
    } catch {
      // Re-copy on error
    }
  }

  log("INFO", `Extracting standalone server to: ${destDir}`);
  try {
    copyFromAsar(sourceDir, destDir);

    // Also copy .next/static
    const staticSource = path.join(path.dirname(sourceDir), "..", "static");
    if (fs.existsSync(staticSource)) {
      const staticDest = path.join(destDir, ".next", "static");
      log("INFO", "Copying static assets");
      copyFromAsar(staticSource, staticDest);
    }

    log("INFO", "Standalone server extracted successfully");
    return destPath;
  } catch (err) {
    log("ERROR", `Failed to extract standalone: ${err.message}`);
    return null;
  }
}

// ============================================================
// Start Next.js Server
// ============================================================
async function startNextServer() {
  log("INFO", "Starting Next.js server...");

  // Find port
  serverPort = await findAvailablePort(3000);
  log("INFO", `Using port: ${serverPort}`);

  // Prepare standalone server (extract from asar if needed)
  const serverPath = prepareStandaloneServer();
  if (!serverPath) {
    log("ERROR", "Next.js standalone server.js not found!");
    dialog.showErrorBox(
      "Server Not Found",
      "The Next.js standalone server could not be found. Please rebuild the application."
    );
    app.quit();
    return;
  }

  log("INFO", `Server path: ${serverPath}`);

  // Use Electron as Node.js runtime for the standalone server
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    NODE_ENV: "production",
    PORT: String(serverPort),
    HOSTNAME: "127.0.0.1",
    VISIONBHARAT_DATA_DIR: USER_DATA_PATH,
    DATABASE_URL: process.env.DATABASE_URL || "postgresql://postgres:password@127.0.0.1:5432/visionbharat1",
  };

  // Ensure runtime directories exist
  ensureDir(UPLOADS_DIR);
  ensureDir(DATASETS_DIR);
  ensureDir(CHECKPOINTS_DIR);
  ensureDir(REPORTS_DIR);

  // Set the working directory to the standalone server's directory
  const serverDir = path.dirname(serverPath);

  log("INFO", `Starting server from: ${serverDir}`);
  log("INFO", `Using Electron as Node.js runtime: ${process.execPath}`);

  nextServerProcess = spawn(process.execPath, [serverPath], {
    cwd: serverDir,
    env,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  nextServerProcess.stdout.on("data", (data) => {
    const msg = data.toString().trim();
    if (msg) log("SERVER", msg);
  });

  nextServerProcess.stderr.on("data", (data) => {
    const msg = data.toString().trim();
    if (msg) log("SERVER_WARN", msg);
  });

  nextServerProcess.on("error", (err) => {
    log("ERROR", `Server process error: ${err.message}`);
  });

  nextServerProcess.on("exit", (code, signal) => {
    log("INFO", `Server process exited with code ${code}, signal ${signal}`);
    nextServerProcess = null;
  });

  // Wait for server to be ready
  return waitForServer(serverPort, SERVER_STARTUP_TIMEOUT);
}

// ============================================================
// Health Check / Wait for Server
// ============================================================
function waitForServer(port, timeout) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    function check() {
      const req = require("http").get(`http://127.0.0.1:${port}`, (res) => {
        // Any response means server is up
        res.resume();
        resolve(true);
      });

      req.on("error", () => {
        if (Date.now() - start > timeout) {
          reject(new Error("Server startup timed out"));
          return;
        }
        setTimeout(check, HEALTH_CHECK_INTERVAL);
      });

      req.setTimeout(2000, () => {
        req.destroy();
        if (Date.now() - start > timeout) {
          reject(new Error("Server startup timed out"));
          return;
        }
        setTimeout(check, HEALTH_CHECK_INTERVAL);
      });
    }

    check();
  });
}

// ============================================================
// Create Browser Window
// ============================================================
function createWindow() {
  log("INFO", "Creating browser window...");

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    title: "VisionBharat — DataGenesis 2026",
    icon: app.isPackaged ? path.join(process.resourcesPath, "icon.ico") : undefined,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
    },
  });

  // Security: restrict navigation
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const parsedUrl = new URL(url);
    if (parsedUrl.hostname !== "127.0.0.1" && parsedUrl.hostname !== "localhost") {
      event.preventDefault();
    }
  });

  // Security: open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  // Show window when ready
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    log("INFO", "Window shown");
  });

  // Load the app
  const loadUrl = `http://127.0.0.1:${serverPort}`;
  log("INFO", `Loading: ${loadUrl}`);
  mainWindow.loadURL(loadUrl);

  // Handle window close
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ============================================================
// IPC Handlers
// ============================================================
ipcMain.handle("app:info", () => ({
  name: APP_NAME,
  version: app.getVersion(),
  electronVersion: process.versions.electron,
  nodeVersion: process.versions.node,
  platform: process.platform,
  arch: process.arch,
  userDataPath: USER_DATA_PATH,
}));

ipcMain.handle("app:open-folder", async (_event, folder) => {
  const target = folder === "userData" ? USER_DATA_PATH : folder;
  shell.openPath(target);
});

// ============================================================
// App Lifecycle
// ============================================================
app.whenReady().then(async () => {
  log("INFO", "=== VisionBharat Electron Starting ===");
  log("INFO", `Platform: ${process.platform} ${process.arch}`);
  log("INFO", `Electron: ${process.versions.electron}`);
  log("INFO", `User data: ${USER_DATA_PATH}`);

  // Initialize directories
  ensureDir(LOGS_DIR);
  ensureDir(UPLOADS_DIR);
  ensureDir(DATASETS_DIR);
  ensureDir(CHECKPOINTS_DIR);
  ensureDir(REPORTS_DIR);

  try {
    await startNextServer();
    log("INFO", "Server started successfully");
    createWindow();
  } catch (err) {
    log("ERROR", `Failed to start server: ${err.message}`);
    dialog.showErrorBox(
      "Startup Error",
      `Failed to start the VisionBharat server.\n\n${err.message}\n\nPlease ensure PostgreSQL is running and try again.`
    );
    app.quit();
  }
});

app.on("window-all-closed", () => {
  log("INFO", "All windows closed");
  app.quit();
});

app.on("before-quit", () => {
  log("INFO", "Application quitting...");

  // Kill the Next.js server process
  if (nextServerProcess) {
    log("INFO", "Stopping Next.js server...");
    try {
      nextServerProcess.kill("SIGTERM");
      // Give it a moment to shut down gracefully
      setTimeout(() => {
        if (nextServerProcess) {
          try {
            nextServerProcess.kill("SIGKILL");
          } catch {
            // process already dead
          }
        }
      }, 3000);
    } catch (err) {
      log("WARN", `Error killing server: ${err.message}`);
    }
  }

  log("INFO", "=== VisionBharat Electron Stopped ===");
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});
