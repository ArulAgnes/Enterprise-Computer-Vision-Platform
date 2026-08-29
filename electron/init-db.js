/**
 * VisionBharat — Database Schema Initialization
 * Creates all tables for the VisionBharat platform.
 * Runs against the embedded PostgreSQL instance.
 */

const SCHEMA_SQL = `
-- ============================================================
-- VisionBharat — DataGenesis 2026 Database Schema
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- DATASET MANAGEMENT
-- ============================================================

CREATE TABLE IF NOT EXISTS datasets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  dataset_id VARCHAR(100) NOT NULL UNIQUE,
  theme VARCHAR(255),
  description TEXT,
  collection_location VARCHAR(255),
  collection_date TIMESTAMP,
  photographer VARCHAR(255),
  device VARCHAR(255),
  default_resolution VARCHAR(50),
  lighting_condition VARCHAR(100),
  environment VARCHAR(100),
  notes TEXT,
  status VARCHAR(50) DEFAULT 'active',
  version VARCHAR(20) DEFAULT '0.1',
  is_demo BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dataset_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id UUID REFERENCES datasets(id),
  version VARCHAR(20) NOT NULL,
  change_description TEXT,
  images_added INTEGER DEFAULT 0,
  images_removed INTEGER DEFAULT 0,
  annotations_changed INTEGER DEFAULT 0,
  classes_changed INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id UUID REFERENCES datasets(id),
  name VARCHAR(255) NOT NULL,
  class_index INTEGER NOT NULL,
  description TEXT,
  color VARCHAR(7),
  image_count INTEGER DEFAULT 0,
  annotation_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- IMAGE MANAGEMENT
-- ============================================================

CREATE TABLE IF NOT EXISTS images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id UUID REFERENCES datasets(id),
  filename VARCHAR(500) NOT NULL,
  original_filename VARCHAR(500),
  filepath TEXT,
  resolution VARCHAR(50),
  width INTEGER,
  height INTEGER,
  file_size INTEGER,
  mime_type VARCHAR(50),
  image_hash VARCHAR(64),
  perceptual_hash VARCHAR(64),
  capture_timestamp TIMESTAMP,
  device VARCHAR(255),
  split_type VARCHAR(20),
  class_status VARCHAR(50) DEFAULT 'unassigned',
  annotation_status VARCHAR(50) DEFAULT 'unannotated',
  quality_status VARCHAR(20) DEFAULT 'pending',
  is_demo BOOLEAN DEFAULT FALSE,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- QUALITY ANALYSIS
-- ============================================================

CREATE TABLE IF NOT EXISTS quality_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id UUID REFERENCES images(id),
  dataset_id UUID REFERENCES datasets(id),
  brightness DOUBLE PRECISION,
  contrast DOUBLE PRECISION,
  blur_score DOUBLE PRECISION,
  sharpness DOUBLE PRECISION,
  noise_estimate DOUBLE PRECISION,
  entropy DOUBLE PRECISION,
  exposure_estimate DOUBLE PRECISION,
  aspect_ratio DOUBLE PRECISION,
  is_blurry BOOLEAN DEFAULT FALSE,
  is_dark BOOLEAN DEFAULT FALSE,
  is_overexposed BOOLEAN DEFAULT FALSE,
  is_tiny BOOLEAN DEFAULT FALSE,
  is_corrupt BOOLEAN DEFAULT FALSE,
  is_duplicate BOOLEAN DEFAULT FALSE,
  quality_score DOUBLE PRECISION,
  quality_flag VARCHAR(10) DEFAULT 'green',
  review_notes TEXT,
  reviewed_by VARCHAR(255),
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- DUPLICATE GROUPS
-- ============================================================

CREATE TABLE IF NOT EXISTS duplicate_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id UUID REFERENCES datasets(id),
  group_type VARCHAR(20),
  similarity_score DOUBLE PRECISION,
  resolution VARCHAR(50),
  image_ids JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- ANNOTATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id UUID REFERENCES images(id),
  dataset_id UUID REFERENCES datasets(id),
  class_id UUID REFERENCES classes(id),
  class_name VARCHAR(255),
  x DOUBLE PRECISION NOT NULL,
  y DOUBLE PRECISION NOT NULL,
  width DOUBLE PRECISION NOT NULL,
  height DOUBLE PRECISION NOT NULL,
  normalized_x DOUBLE PRECISION,
  normalized_y DOUBLE PRECISION,
  normalized_w DOUBLE PRECISION,
  normalized_h DOUBLE PRECISION,
  is_valid BOOLEAN DEFAULT TRUE,
  validation_error TEXT,
  annotator VARCHAR(255),
  annotation_version INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- ANNOTATION VALIDATION
-- ============================================================

CREATE TABLE IF NOT EXISTS annotation_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id UUID REFERENCES datasets(id),
  total_annotations INTEGER,
  valid_annotations INTEGER,
  invalid_annotations INTEGER,
  outside_image INTEGER DEFAULT 0,
  zero_width INTEGER DEFAULT 0,
  zero_height INTEGER DEFAULT 0,
  extremely_small INTEGER DEFAULT 0,
  overlapping INTEGER DEFAULT 0,
  duplicate_boxes INTEGER DEFAULT 0,
  missing_labels INTEGER DEFAULT 0,
  invalid_class_ids INTEGER DEFAULT 0,
  health_score DOUBLE PRECISION,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- DATASET SPLITS
-- ============================================================

CREATE TABLE IF NOT EXISTS dataset_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id UUID REFERENCES datasets(id),
  version VARCHAR(20),
  train_ratio DOUBLE PRECISION DEFAULT 0.7,
  val_ratio DOUBLE PRECISION DEFAULT 0.15,
  test_ratio DOUBLE PRECISION DEFAULT 0.15,
  train_count INTEGER DEFAULT 0,
  val_count INTEGER DEFAULT 0,
  test_count INTEGER DEFAULT 0,
  random_seed INTEGER DEFAULT 42,
  leakage_detected BOOLEAN DEFAULT FALSE,
  leakage_details JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- EXPERIMENTS & TRAINING
-- ============================================================

CREATE TABLE IF NOT EXISTS experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255),
  description TEXT,
  dataset_id UUID REFERENCES datasets(id),
  dataset_version VARCHAR(20),
  model_id UUID,
  image_size INTEGER DEFAULT 640,
  batch_size INTEGER DEFAULT 16,
  epochs INTEGER DEFAULT 100,
  learning_rate DOUBLE PRECISION DEFAULT 0.001,
  optimizer VARCHAR(50) DEFAULT 'adam',
  weight_decay DOUBLE PRECISION DEFAULT 0.0005,
  augmentation_config JSONB,
  iou_threshold DOUBLE PRECISION DEFAULT 0.5,
  confidence_threshold DOUBLE PRECISION DEFAULT 0.5,
  random_seed INTEGER DEFAULT 42,
  status VARCHAR(50) DEFAULT 'created',
  current_epoch INTEGER DEFAULT 0,
  train_loss DOUBLE PRECISION,
  val_loss DOUBLE PRECISION,
  box_loss DOUBLE PRECISION,
  objectness_loss DOUBLE PRECISION,
  class_loss DOUBLE PRECISION,
  precision DOUBLE PRECISION,
  recall DOUBLE PRECISION,
  f1 DOUBLE PRECISION,
  iou DOUBLE PRECISION,
  best_val_score DOUBLE PRECISION,
  training_duration INTEGER,
  hardware VARCHAR(255),
  is_demo BOOLEAN DEFAULT FALSE,
  config JSONB,
  results JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS training_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID REFERENCES experiments(id),
  epoch INTEGER NOT NULL,
  train_loss DOUBLE PRECISION,
  val_loss DOUBLE PRECISION,
  box_loss DOUBLE PRECISION,
  objectness_loss DOUBLE PRECISION,
  class_loss DOUBLE PRECISION,
  precision DOUBLE PRECISION,
  recall DOUBLE PRECISION,
  f1 DOUBLE PRECISION,
  iou DOUBLE PRECISION,
  learning_rate DOUBLE PRECISION,
  timestamp TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- MODELS
-- ============================================================

CREATE TABLE IF NOT EXISTS models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  version VARCHAR(20) DEFAULT '1.0',
  architecture TEXT,
  dataset_id UUID REFERENCES datasets(id),
  experiment_id UUID REFERENCES experiments(id),
  parameter_count INTEGER,
  image_size INTEGER DEFAULT 640,
  num_classes INTEGER,
  class_names JSONB,
  status VARCHAR(50) DEFAULT 'training',
  precision DOUBLE PRECISION,
  recall DOUBLE PRECISION,
  f1 DOUBLE PRECISION,
  iou DOUBLE PRECISION,
  map_score DOUBLE PRECISION,
  inference_time_ms DOUBLE PRECISION,
  checkpoint_path TEXT,
  best_checkpoint_path TEXT,
  is_from_scratch BOOLEAN DEFAULT TRUE,
  uses_pretrained BOOLEAN DEFAULT FALSE,
  training_duration INTEGER,
  hardware VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- EVALUATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID REFERENCES models(id),
  experiment_id UUID REFERENCES experiments(id),
  dataset_id UUID REFERENCES datasets(id),
  eval_type VARCHAR(50),
  iou_threshold DOUBLE PRECISION DEFAULT 0.5,
  confidence_threshold DOUBLE PRECISION DEFAULT 0.5,
  total_images INTEGER,
  total_ground_truth INTEGER,
  total_detections INTEGER,
  true_positives INTEGER DEFAULT 0,
  false_positives INTEGER DEFAULT 0,
  false_negatives INTEGER DEFAULT 0,
  precision DOUBLE PRECISION,
  recall DOUBLE PRECISION,
  f1 DOUBLE PRECISION,
  mean_iou DOUBLE PRECISION,
  map_score DOUBLE PRECISION,
  per_class_metrics JSONB,
  confusion_matrix JSONB,
  error_analysis JSONB,
  is_test_set_used BOOLEAN DEFAULT FALSE,
  is_demo BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- INFERENCE RUNS
-- ============================================================

CREATE TABLE IF NOT EXISTS inference_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID REFERENCES models(id),
  image_id UUID,
  detections JSONB,
  num_detections INTEGER DEFAULT 0,
  inference_time_ms DOUBLE PRECISION,
  image_width INTEGER,
  image_height INTEGER,
  model_version VARCHAR(20),
  is_demo BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- SYSTEM & CONFIG
-- ============================================================

CREATE TABLE IF NOT EXISTS system_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(255) NOT NULL UNIQUE,
  value JSONB,
  description TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(50) NOT NULL,
  action VARCHAR(255) NOT NULL,
  details JSONB,
  user_id VARCHAR(255),
  timestamp TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- KAGGLE PUBLICATION
-- ============================================================

CREATE TABLE IF NOT EXISTS kaggle_publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id UUID REFERENCES datasets(id),
  dataset_version VARCHAR(20),
  kaggle_username VARCHAR(255),
  kaggle_slug VARCHAR(255),
  kaggle_title VARCHAR(500),
  kaggle_url TEXT,
  status VARCHAR(50) DEFAULT 'not_published',
  published_at TIMESTAMP,
  verified_at TIMESTAMP,
  last_error TEXT,
  export_dir TEXT,
  notebook_slug VARCHAR(255),
  notebook_url TEXT,
  notebook_status VARCHAR(50) DEFAULT 'not_generated',
  notebook_published_at TIMESTAMP,
  notebook_verified_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_images_dataset_id ON images(dataset_id);
CREATE INDEX IF NOT EXISTS idx_images_annotation_status ON images(annotation_status);
CREATE INDEX IF NOT EXISTS idx_images_class_status ON images(class_status);
CREATE INDEX IF NOT EXISTS idx_annotations_image_id ON annotations(image_id);
CREATE INDEX IF NOT EXISTS idx_annotations_dataset_id ON annotations(dataset_id);
CREATE INDEX IF NOT EXISTS idx_annotations_class_id ON annotations(class_id);
CREATE INDEX IF NOT EXISTS idx_classes_dataset_id ON classes(dataset_id);
CREATE INDEX IF NOT EXISTS idx_quality_reports_image_id ON quality_reports(image_id);
CREATE INDEX IF NOT EXISTS idx_quality_reports_dataset_id ON quality_reports(dataset_id);
CREATE INDEX IF NOT EXISTS idx_experiments_dataset_id ON experiments(dataset_id);
CREATE INDEX IF NOT EXISTS idx_training_metrics_experiment_id ON training_metrics(experiment_id);
CREATE INDEX IF NOT EXISTS idx_models_dataset_id ON models(dataset_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_model_id ON evaluations(model_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_dataset_id ON evaluations(dataset_id);
CREATE INDEX IF NOT EXISTS idx_inference_runs_model_id ON inference_runs(model_id);
CREATE INDEX IF NOT EXISTS idx_dataset_versions_dataset_id ON dataset_versions(dataset_id);
CREATE INDEX IF NOT EXISTS idx_dataset_splits_dataset_id ON dataset_splits(dataset_id);
CREATE INDEX IF NOT EXISTS idx_annotation_validations_dataset_id ON annotation_validations(dataset_id);
CREATE INDEX IF NOT EXISTS idx_duplicate_groups_dataset_id ON duplicate_groups(dataset_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_category ON activity_log(category);
CREATE INDEX IF NOT EXISTS idx_activity_log_timestamp ON activity_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_system_config_key ON system_config(key);
CREATE INDEX IF NOT EXISTS idx_kaggle_publications_dataset_id ON kaggle_publications(dataset_id);
`;

/**
 * Initialize the database schema.
 * @param {import('pg').Client} client - Connected pg Client
 * @param {function} log - Logging function
 */
async function initializeSchema(client, log) {
  log("DB_INIT", "Creating database schema...");

  try {
    // Split by semicolons and execute each statement
    const statements = SCHEMA_SQL
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith("--"));

    let created = 0;
    for (const stmt of statements) {
      try {
        await client.query(stmt + ";");
        created++;
      } catch (err) {
        // Ignore "already exists" errors
        if (!err.message.includes("already exists")) {
          log("WARN", `Schema statement warning: ${err.message}`);
        }
      }
    }

    log("DB_INIT", `Schema initialization complete (${created} statements executed)`);
  } catch (err) {
    log("ERROR", `Schema initialization failed: ${err.message}`);
    throw err;
  }
}

/**
 * Insert demo data if the database is empty.
 * @param {import('pg').Client} client - Connected pg Client
 * @param {function} log - Logging function
 */
async function insertDemoData(client, log) {
  // Check if demo data already exists
  const checkResult = await client.query("SELECT COUNT(*) FROM datasets");
  if (parseInt(checkResult.rows[0].count) > 0) {
    log("DB_INIT", "Database already has data, skipping demo data insertion");
    return;
  }

  log("DB_INIT", "Inserting demo data...");

  // Insert demo dataset
  const datasetResult = await client.query(`
    INSERT INTO datasets (name, dataset_id, theme, description, status, is_demo)
    VALUES (
      'Demo Dataset',
      'demo-001',
      'general',
      'A demonstration dataset for VisionBharat platform showcase.',
      'active',
      TRUE
    )
    RETURNING id
  `);

  const datasetId = datasetResult.rows[0].id;

  // Insert demo classes
  await client.query(`
    INSERT INTO classes (dataset_id, name, class_index, description, color, image_count, is_active)
    VALUES
      ($1, 'Background', 0, 'Background class', '#808080', 0, TRUE),
      ($1, 'Object', 1, 'Primary object class', '#FF0000', 0, TRUE),
      ($1, 'Secondary', 2, 'Secondary object class', '#00FF00', 0, TRUE)
  `, [datasetId]);

  // Insert system config
  await client.query(`
    INSERT INTO system_config (key, value, description)
    VALUES
      ('app_version', '"1.0.0"', 'Application version'),
      ('competition', '"DataGenesis 2026"', 'Competition name'),
      ('institution', '"Ramco Institute of Technology"', 'Institution name'),
      ('project_lead', '"Arul Maria Agnes"', 'Project lead name')
    ON CONFLICT (key) DO NOTHING
  `);

  // Insert activity log entry
  await client.query(`
    INSERT INTO activity_log (category, action, details, user_id)
    VALUES ('system', 'database_initialized', '{"source": "electron_setup"}', 'system')
  `);

  log("DB_INIT", "Demo data inserted successfully");
}

module.exports = { initializeSchema, insertDemoData, SCHEMA_SQL };
