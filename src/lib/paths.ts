import path from "path";
import fs from "fs";

// In Electron, VISIONBHARAT_DATA_DIR points to the writable userData directory.
// In development / Docker, falls back to process.cwd().
export const PROJECT_ROOT = process.env.VISIONBHARAT_DATA_DIR || process.cwd();
export const IS_ELECTRON = !!process.env.VISIONBHARAT_DATA_DIR;

// App installation directory (where ai/ and python-embed/ live)
// In Electron packaged mode, this is the asar parent directory.
// In development, this is the project root.
export const APP_DIR = process.env.VISIONBHARAT_APP_DIR || PROJECT_ROOT;

// Bundled Python executable path
export const PYTHON_DIR = process.env.VISIONBHARAT_PYTHON_DIR || "";

/**
 * Candidate interpreters, in priority order.
 *
 * The virtualenv directory is *never* referenced as a literal path here: it is
 * supplied through `VISIONBHARAT_VENV_DIR` (see .env.example). That keeps the
 * bundled/interpreter lookup fully data-driven — no hardcoded environment path
 * can break the build or a packaged Electron app.
 */
export function getPythonCandidates(): string[] {
  const isWin = process.platform === "win32";
  const candidates: string[] = [];

  if (PYTHON_DIR) {
    candidates.push(path.join(PYTHON_DIR, "python.exe"));
    candidates.push(path.join(PYTHON_DIR, "bin", "python3"));
    candidates.push(path.join(PYTHON_DIR, "bin", "python"));
  }

  const venvDir = process.env.VISIONBHARAT_VENV_DIR;
  if (venvDir) {
    candidates.push(path.join(venvDir, isWin ? "Scripts" : "bin", isWin ? "python.exe" : "python"));
  }

  if (isWin) {
    candidates.push("python", "py");
  } else {
    candidates.push("python3", "python");
  }
  return candidates;
}

/**
 * Resolve the Python interpreter.
 *
 * NEVER throws: if the bundled Electron interpreter (or the venv) is missing we
 * fall back to the system interpreter ("python" / "python3"), and finally to the
 * first candidate so the caller always receives a usable command string.
 */
export function getPythonPath(): string {
  const configured = process.env.VISIONBHARAT_PYTHON;
  if (configured) {
    // A relative interpreter path is resolved against the project root, because
    // python is spawned with cwd = ai/ and a bare "./.venv/bin/python" would
    // otherwise point at ai/.venv/bin/python.
    if (!path.isAbsolute(configured) && (configured.includes("/") || configured.includes("\\"))) {
      return path.resolve(PROJECT_ROOT, configured);
    }
    return configured;
  }

  for (const candidate of getPythonCandidates()) {
    if (!candidate.includes(path.sep)) {
      // Bare command name ("python") — resolved by the shell at spawn time.
      return candidate;
    }
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // ignore and keep looking
    }
  }
  return process.platform === "win32" ? "python" : "python3";
}

export const PYTHON_EXECUTABLE = getPythonPath();

// AI scripts directory
export const AI_DIR = process.env.VISIONBHARAT_AI_DIR || path.join(APP_DIR, "ai");

export const UPLOADS_DIR = path.join(PROJECT_ROOT, "uploads");
export const DATASETS_DIR = path.join(PROJECT_ROOT, "datasets");
export const CHECKPOINTS_DIR = path.join(AI_DIR, "checkpoints");
export const REPORTS_DIR = path.join(PROJECT_ROOT, "reports");
export const LOGS_DIR = path.join(PROJECT_ROOT, "logs");

// ---------------------------------------------------------------------------
// VisionBharat V2 pipeline directories
// ---------------------------------------------------------------------------

/**
 * Root folder with the team-captured photos (bell/ and oillamp/ subfolders).
 * Supports the Windows competition layout `D:\IEEE\100%Project\captured_photos`
 * as well as a repo-local `captured_photos/` folder.
 */
export const CAPTURED_PHOTOS_DIR =
  process.env.VISIONBHARAT_CAPTURED_PHOTOS ||
  [
    path.join(PROJECT_ROOT, "captured_photos"),
    "D:\\IEEE\\100%Project\\captured_photos",
    "D:/IEEE/100%Project/captured_photos",
  ].find((p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  }) ||
  path.join(PROJECT_ROOT, "captured_photos");

/** Folder with generated synthetic samples (Invention 1 output). */
export const AUGMENTED_DIR = path.join(CAPTURED_PHOTOS_DIR, "augmented");

/** Where split.json / train_split.json / val_split.json / test_split.json live. */
export const SPLIT_DIR = process.env.VISIONBHARAT_SPLIT_DIR || path.join(PROJECT_ROOT, "dataset");

/** Judge-facing model artefacts. */
export const MODELS_DIR = process.env.VISIONBHARAT_MODELS_DIR || path.join(PROJECT_ROOT, "models");
export const VISIONBHARAT_V2_BEST = path.join(MODELS_DIR, "visionbharat_v2_best.pt");
export const BEST_PT = path.join(CHECKPOINTS_DIR, "best.pt");
export const EPOCH10_PT = path.join(CHECKPOINTS_DIR, "epoch_10.pt");

/** Annotated inference frames written by ai/infer.py. */
export const INFERENCE_OUTPUT_DIR = path.join(PROJECT_ROOT, "outputs", "inference");
export const TEMP_DIR = path.join(PROJECT_ROOT, ".visionbharat-tmp");

/** Folder-name -> class-name convention for the captured photos. */
export const FOLDER_CLASS_MAP: Record<string, string> = {
  bell: "temple_bell",
  temple_bell: "temple_bell",
  oillamp: "clay_diya",
  oil_lamp: "clay_diya",
  oilamp: "clay_diya",
  diya: "clay_diya",
  clay_diya: "clay_diya",
  brass_diya: "brass_diya",
  hanging_diya: "hanging_diya",
  multi_wick_diya: "multi_wick_diya",
  kuthu_vilakku: "kuthu_vilakku",
  incense_holder: "incense_holder",
  ritual_plate: "ritual_plate",
};

export function classFromFolder(folderName: string): string {
  const key = folderName.toLowerCase().replace(/[\s-]+/g, "_");
  return FOLDER_CLASS_MAP[key] || key;
}

export function ensureDir(dir: string): string {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getUploadPath(datasetId: string): string {
  return path.join(UPLOADS_DIR, datasetId);
}

export function getDatasetImagePath(split: string): string {
  return path.join(DATASETS_DIR, "images", split);
}

export function getDatasetLabelPath(split: string): string {
  return path.join(DATASETS_DIR, "labels", split);
}

export function getCheckpointPath(modelId: string): string {
  return path.join(CHECKPOINTS_DIR, modelId);
}
