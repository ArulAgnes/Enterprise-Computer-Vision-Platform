import path from "path";

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
export const PYTHON_EXECUTABLE = PYTHON_DIR
  ? path.join(PYTHON_DIR, "python.exe")
  : process.platform === "win32"
    ? "python"
    : "python3";

// AI scripts directory
export const AI_DIR = process.env.VISIONBHARAT_AI_DIR || path.join(APP_DIR, "ai");

export const UPLOADS_DIR = path.join(PROJECT_ROOT, "uploads");
export const DATASETS_DIR = path.join(PROJECT_ROOT, "datasets");
export const CHECKPOINTS_DIR = path.join(PROJECT_ROOT, "checkpoints");
export const REPORTS_DIR = path.join(PROJECT_ROOT, "reports");
export const LOGS_DIR = path.join(PROJECT_ROOT, "logs");

export const DATASET_IMAGES_DIR = path.join(DATASETS_DIR, "images");
export const DATASET_LABELS_DIR = path.join(DATASETS_DIR, "labels");
export const DATASET_RAW_DIR = path.join(DATASETS_DIR, "raw");
export const DATASET_PROCESSED_DIR = path.join(DATASETS_DIR, "processed");
export const DATASET_METADATA_DIR = path.join(DATASETS_DIR, "metadata");
export const DATASET_VERSIONS_DIR = path.join(DATASETS_DIR, "versions");

export function getUploadPath(datasetId: string): string {
  return path.join(UPLOADS_DIR, datasetId);
}

export function getDatasetImagePath(split: string): string {
  return path.join(DATASET_IMAGES_DIR, split);
}

export function getDatasetLabelPath(split: string): string {
  return path.join(DATASET_LABELS_DIR, split);
}

export function getCheckpointPath(modelId: string): string {
  return path.join(CHECKPOINTS_DIR, modelId);
}
