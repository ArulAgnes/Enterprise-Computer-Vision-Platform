/**
 * VisionBharat — DataGenesis 2026 Database Schema
 * Complete schema for India-centric CV dataset engineering platform
 * 
 * Project Lead: Arul Maria Agnes
 * Competition: DataGenesis 2026 National AI & CV Hackathon
 * Institution: Ramco Institute of Technology, Rajapalayam
 */

import { pgTable, uuid, text, timestamp, integer, boolean, jsonb, doublePrecision, varchar } from "drizzle-orm/pg-core";

// ============================================================
// DATASET MANAGEMENT
// ============================================================

export const datasets = pgTable("datasets", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  datasetId: varchar("dataset_id", { length: 100 }).notNull().unique(),
  theme: varchar("theme", { length: 255 }),
  description: text("description"),
  collectionLocation: varchar("collection_location", { length: 255 }),
  collectionDate: timestamp("collection_date"),
  photographer: varchar("photographer", { length: 255 }),
  device: varchar("device", { length: 255 }),
  defaultResolution: varchar("default_resolution", { length: 50 }),
  lightingCondition: varchar("lighting_condition", { length: 100 }),
  environment: varchar("environment", { length: 100 }),
  notes: text("notes"),
  status: varchar("status", { length: 50 }).default("active"),
  version: varchar("version", { length: 20 }).default("0.1"),
  isDemo: boolean("is_demo").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const datasetVersions = pgTable("dataset_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  datasetId: uuid("dataset_id").references(() => datasets.id),
  version: varchar("version", { length: 20 }).notNull(),
  changeDescription: text("change_description"),
  imagesAdded: integer("images_added").default(0),
  imagesRemoved: integer("images_removed").default(0),
  annotationsChanged: integer("annotations_changed").default(0),
  classesChanged: integer("classes_changed").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const classes = pgTable("classes", {
  id: uuid("id").defaultRandom().primaryKey(),
  datasetId: uuid("dataset_id").references(() => datasets.id),
  name: varchar("name", { length: 255 }).notNull(),
  classIndex: integer("class_index").notNull(),
  description: text("description"),
  color: varchar("color", { length: 7 }),
  imageCount: integer("image_count").default(0),
  annotationCount: integer("annotation_count").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================
// IMAGE MANAGEMENT
// ============================================================

export const images = pgTable("images", {
  id: uuid("id").defaultRandom().primaryKey(),
  datasetId: uuid("dataset_id").references(() => datasets.id),
  filename: varchar("filename", { length: 500 }).notNull(),
  originalFilename: varchar("original_filename", { length: 500 }),
  filepath: text("filepath"),
  resolution: varchar("resolution", { length: 50 }),
  width: integer("width"),
  height: integer("height"),
  fileSize: integer("file_size"),
  mimeType: varchar("mime_type", { length: 50 }),
  imageHash: varchar("image_hash", { length: 64 }),
  perceptualHash: varchar("perceptual_hash", { length: 64 }),
  captureTimestamp: timestamp("capture_timestamp"),
  device: varchar("device", { length: 255 }),
  splitType: varchar("split_type", { length: 20 }),
  classStatus: varchar("class_status", { length: 50 }).default("unassigned"),
  annotationStatus: varchar("annotation_status", { length: 50 }).default("unannotated"),
  qualityStatus: varchar("quality_status", { length: 20 }).default("pending"),
  isDemo: boolean("is_demo").default(false),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ============================================================
// QUALITY ANALYSIS
// ============================================================

export const qualityReports = pgTable("quality_reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  imageId: uuid("image_id").references(() => images.id),
  datasetId: uuid("dataset_id").references(() => datasets.id),
  brightness: doublePrecision("brightness"),
  contrast: doublePrecision("contrast"),
  blurScore: doublePrecision("blur_score"),
  sharpness: doublePrecision("sharpness"),
  noiseEstimate: doublePrecision("noise_estimate"),
  entropy: doublePrecision("entropy"),
  exposureEstimate: doublePrecision("exposure_estimate"),
  aspectRatio: doublePrecision("aspect_ratio"),
  isBlurry: boolean("is_blurry").default(false),
  isDark: boolean("is_dark").default(false),
  isOverexposed: boolean("is_overexposed").default(false),
  isTiny: boolean("is_tiny").default(false),
  isCorrupt: boolean("is_corrupt").default(false),
  isDuplicate: boolean("is_duplicate").default(false),
  qualityScore: doublePrecision("quality_score"),
  qualityFlag: varchar("quality_flag", { length: 10 }).default("green"),
  reviewNotes: text("review_notes"),
  reviewedBy: varchar("reviewed_by", { length: 255 }),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================
// DUPLICATE GROUPS
// ============================================================

export const duplicateGroups = pgTable("duplicate_groups", {
  id: uuid("id").defaultRandom().primaryKey(),
  datasetId: uuid("dataset_id").references(() => datasets.id),
  groupType: varchar("group_type", { length: 20 }),
  similarityScore: doublePrecision("similarity_score"),
  resolution: varchar("resolution", { length: 50 }),
  imageIds: jsonb("image_ids"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================
// ANNOTATIONS
// ============================================================

export const annotations = pgTable("annotations", {
  id: uuid("id").defaultRandom().primaryKey(),
  imageId: uuid("image_id").references(() => images.id),
  datasetId: uuid("dataset_id").references(() => datasets.id),
  classId: uuid("class_id").references(() => classes.id),
  className: varchar("class_name", { length: 255 }),
  x: doublePrecision("x").notNull(),
  y: doublePrecision("y").notNull(),
  width: doublePrecision("width").notNull(),
  height: doublePrecision("height").notNull(),
  normalizedX: doublePrecision("normalized_x"),
  normalizedY: doublePrecision("normalized_y"),
  normalizedW: doublePrecision("normalized_w"),
  normalizedH: doublePrecision("normalized_h"),
  isValid: boolean("is_valid").default(true),
  validationError: text("validation_error"),
  annotator: varchar("annotator", { length: 255 }),
  annotationVersion: integer("annotation_version").default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ============================================================
// ANNOTATION VALIDATION
// ============================================================

export const annotationValidations = pgTable("annotation_validations", {
  id: uuid("id").defaultRandom().primaryKey(),
  datasetId: uuid("dataset_id").references(() => datasets.id),
  totalAnnotations: integer("total_annotations"),
  validAnnotations: integer("valid_annotations"),
  invalidAnnotations: integer("invalid_annotations"),
  outsideImage: integer("outside_image").default(0),
  zeroWidth: integer("zero_width").default(0),
  zeroHeight: integer("zero_height").default(0),
  extremelySmall: integer("extremely_small").default(0),
  overlapping: integer("overlapping").default(0),
  duplicateBoxes: integer("duplicate_boxes").default(0),
  missingLabels: integer("missing_labels").default(0),
  invalidClassIds: integer("invalid_class_ids").default(0),
  healthScore: doublePrecision("health_score"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================
// DATASET SPLITS
// ============================================================

export const datasetSplits = pgTable("dataset_splits", {
  id: uuid("id").defaultRandom().primaryKey(),
  datasetId: uuid("dataset_id").references(() => datasets.id),
  version: varchar("version", { length: 20 }),
  trainRatio: doublePrecision("train_ratio").default(0.7),
  valRatio: doublePrecision("val_ratio").default(0.15),
  testRatio: doublePrecision("test_ratio").default(0.15),
  trainCount: integer("train_count").default(0),
  valCount: integer("val_count").default(0),
  testCount: integer("test_count").default(0),
  randomSeed: integer("random_seed").default(42),
  leakageDetected: boolean("leakage_detected").default(false),
  leakageDetails: jsonb("leakage_details"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================
// EXPERIMENTS & TRAINING
// ============================================================

export const experiments = pgTable("experiments", {
  id: uuid("id").defaultRandom().primaryKey(),
  experimentId: varchar("experiment_id", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  description: text("description"),
  datasetId: uuid("dataset_id").references(() => datasets.id),
  datasetVersion: varchar("dataset_version", { length: 20 }),
  modelId: uuid("model_id"),
  imageSize: integer("image_size").default(640),
  batchSize: integer("batch_size").default(16),
  epochs: integer("epochs").default(100),
  learningRate: doublePrecision("learning_rate").default(0.001),
  optimizer: varchar("optimizer", { length: 50 }).default("adam"),
  weightDecay: doublePrecision("weight_decay").default(0.0005),
  augmentationConfig: jsonb("augmentation_config"),
  iouThreshold: doublePrecision("iou_threshold").default(0.5),
  confidenceThreshold: doublePrecision("confidence_threshold").default(0.5),
  randomSeed: integer("random_seed").default(42),
  status: varchar("status", { length: 50 }).default("created"),
  currentEpoch: integer("current_epoch").default(0),
  trainLoss: doublePrecision("train_loss"),
  valLoss: doublePrecision("val_loss"),
  boxLoss: doublePrecision("box_loss"),
  objectnessLoss: doublePrecision("objectness_loss"),
  classLoss: doublePrecision("class_loss"),
  precision: doublePrecision("precision"),
  recall: doublePrecision("recall"),
  f1: doublePrecision("f1"),
  iou: doublePrecision("iou"),
  bestValScore: doublePrecision("best_val_score"),
  trainingDuration: integer("training_duration"),
  hardware: varchar("hardware", { length: 255 }),
  isDemo: boolean("is_demo").default(false),
  config: jsonb("config"),
  results: jsonb("results"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const trainingMetrics = pgTable("training_metrics", {
  id: uuid("id").defaultRandom().primaryKey(),
  experimentId: uuid("experiment_id").references(() => experiments.id),
  epoch: integer("epoch").notNull(),
  trainLoss: doublePrecision("train_loss"),
  valLoss: doublePrecision("val_loss"),
  boxLoss: doublePrecision("box_loss"),
  objectnessLoss: doublePrecision("objectness_loss"),
  classLoss: doublePrecision("class_loss"),
  precision: doublePrecision("precision"),
  recall: doublePrecision("recall"),
  f1: doublePrecision("f1"),
  iou: doublePrecision("iou"),
  learningRate: doublePrecision("learning_rate"),
  timestamp: timestamp("timestamp").defaultNow(),
});

// ============================================================
// MODELS
// ============================================================

export const models = pgTable("models", {
  id: uuid("id").defaultRandom().primaryKey(),
  modelId: varchar("model_id", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  version: varchar("version", { length: 20 }).default("1.0"),
  architecture: text("architecture"),
  datasetId: uuid("dataset_id").references(() => datasets.id),
  experimentId: uuid("experiment_id").references(() => experiments.id),
  parameterCount: integer("parameter_count"),
  imageSize: integer("image_size").default(640),
  numClasses: integer("num_classes"),
  classNames: jsonb("class_names"),
  status: varchar("status", { length: 50 }).default("training"),
  precision: doublePrecision("precision"),
  recall: doublePrecision("recall"),
  f1: doublePrecision("f1"),
  iou: doublePrecision("iou"),
  mapScore: doublePrecision("map_score"),
  inferenceTimeMs: doublePrecision("inference_time_ms"),
  checkpointPath: text("checkpoint_path"),
  bestCheckpointPath: text("best_checkpoint_path"),
  isFromScratch: boolean("is_from_scratch").default(true),
  usesPretrained: boolean("uses_pretrained").default(false),
  trainingDuration: integer("training_duration"),
  hardware: varchar("hardware", { length: 255 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ============================================================
// EVALUATIONS
// ============================================================

export const evaluations = pgTable("evaluations", {
  id: uuid("id").defaultRandom().primaryKey(),
  modelId: uuid("model_id").references(() => models.id),
  experimentId: uuid("experiment_id").references(() => experiments.id),
  datasetId: uuid("dataset_id").references(() => datasets.id),
  evalType: varchar("eval_type", { length: 50 }),
  iouThreshold: doublePrecision("iou_threshold").default(0.5),
  confidenceThreshold: doublePrecision("confidence_threshold").default(0.5),
  totalImages: integer("total_images"),
  totalGroundTruth: integer("total_ground_truth"),
  totalDetections: integer("total_detections"),
  truePositives: integer("true_positives").default(0),
  falsePositives: integer("false_positives").default(0),
  falseNegatives: integer("false_negatives").default(0),
  precision: doublePrecision("precision"),
  recall: doublePrecision("recall"),
  f1: doublePrecision("f1"),
  meanIou: doublePrecision("mean_iou"),
  mapScore: doublePrecision("map_score"),
  perClassMetrics: jsonb("per_class_metrics"),
  confusionMatrix: jsonb("confusion_matrix"),
  errorAnalysis: jsonb("error_analysis"),
  isTestSetUsed: boolean("is_test_set_used").default(false),
  isDemo: boolean("is_demo").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================
// INFERENCE RUNS
// ============================================================

export const inferenceRuns = pgTable("inference_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  modelId: uuid("model_id").references(() => models.id),
  imageId: uuid("image_id"),
  detections: jsonb("detections"),
  numDetections: integer("num_detections").default(0),
  inferenceTimeMs: doublePrecision("inference_time_ms"),
  imageWidth: integer("image_width"),
  imageHeight: integer("image_height"),
  modelVersion: varchar("model_version", { length: 20 }),
  isDemo: boolean("is_demo").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================
// SYSTEM & CONFIG
// ============================================================

export const systemConfig = pgTable("system_config", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: varchar("key", { length: 255 }).notNull().unique(),
  value: jsonb("value"),
  description: text("description"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const activityLog = pgTable("activity_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  category: varchar("category", { length: 50 }).notNull(),
  action: varchar("action", { length: 255 }).notNull(),
  details: jsonb("details"),
  userId: varchar("user_id", { length: 255 }),
  timestamp: timestamp("timestamp").defaultNow(),
});
