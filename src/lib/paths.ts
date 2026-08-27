import path from "path";

export const PROJECT_ROOT = process.cwd();

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
