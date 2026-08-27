CREATE TABLE "activity_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" varchar(50) NOT NULL,
	"action" varchar(255) NOT NULL,
	"details" jsonb,
	"user_id" varchar(255),
	"timestamp" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "annotation_validations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid,
	"total_annotations" integer,
	"valid_annotations" integer,
	"invalid_annotations" integer,
	"outside_image" integer DEFAULT 0,
	"zero_width" integer DEFAULT 0,
	"zero_height" integer DEFAULT 0,
	"extremely_small" integer DEFAULT 0,
	"overlapping" integer DEFAULT 0,
	"duplicate_boxes" integer DEFAULT 0,
	"missing_labels" integer DEFAULT 0,
	"invalid_class_ids" integer DEFAULT 0,
	"health_score" double precision,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "annotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"image_id" uuid,
	"dataset_id" uuid,
	"class_id" uuid,
	"class_name" varchar(255),
	"x" double precision NOT NULL,
	"y" double precision NOT NULL,
	"width" double precision NOT NULL,
	"height" double precision NOT NULL,
	"normalized_x" double precision,
	"normalized_y" double precision,
	"normalized_w" double precision,
	"normalized_h" double precision,
	"is_valid" boolean DEFAULT true,
	"validation_error" text,
	"annotator" varchar(255),
	"annotation_version" integer DEFAULT 1,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid,
	"name" varchar(255) NOT NULL,
	"class_index" integer NOT NULL,
	"description" text,
	"color" varchar(7),
	"image_count" integer DEFAULT 0,
	"annotation_count" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "dataset_splits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid,
	"version" varchar(20),
	"train_ratio" double precision DEFAULT 0.7,
	"val_ratio" double precision DEFAULT 0.15,
	"test_ratio" double precision DEFAULT 0.15,
	"train_count" integer DEFAULT 0,
	"val_count" integer DEFAULT 0,
	"test_count" integer DEFAULT 0,
	"random_seed" integer DEFAULT 42,
	"leakage_detected" boolean DEFAULT false,
	"leakage_details" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "dataset_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid,
	"version" varchar(20) NOT NULL,
	"change_description" text,
	"images_added" integer DEFAULT 0,
	"images_removed" integer DEFAULT 0,
	"annotations_changed" integer DEFAULT 0,
	"classes_changed" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "datasets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"dataset_id" varchar(100) NOT NULL,
	"theme" varchar(255),
	"description" text,
	"collection_location" varchar(255),
	"collection_date" timestamp,
	"photographer" varchar(255),
	"device" varchar(255),
	"default_resolution" varchar(50),
	"lighting_condition" varchar(100),
	"environment" varchar(100),
	"notes" text,
	"status" varchar(50) DEFAULT 'active',
	"version" varchar(20) DEFAULT '0.1',
	"is_demo" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "datasets_dataset_id_unique" UNIQUE("dataset_id")
);
--> statement-breakpoint
CREATE TABLE "duplicate_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid,
	"group_type" varchar(20),
	"similarity_score" double precision,
	"resolution" varchar(50),
	"image_ids" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" uuid,
	"experiment_id" uuid,
	"dataset_id" uuid,
	"eval_type" varchar(50),
	"iou_threshold" double precision DEFAULT 0.5,
	"confidence_threshold" double precision DEFAULT 0.5,
	"total_images" integer,
	"total_ground_truth" integer,
	"total_detections" integer,
	"true_positives" integer DEFAULT 0,
	"false_positives" integer DEFAULT 0,
	"false_negatives" integer DEFAULT 0,
	"precision" double precision,
	"recall" double precision,
	"f1" double precision,
	"mean_iou" double precision,
	"map_score" double precision,
	"per_class_metrics" jsonb,
	"confusion_matrix" jsonb,
	"error_analysis" jsonb,
	"is_test_set_used" boolean DEFAULT false,
	"is_demo" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "experiments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" varchar(50) NOT NULL,
	"name" varchar(255),
	"description" text,
	"dataset_id" uuid,
	"dataset_version" varchar(20),
	"model_id" uuid,
	"image_size" integer DEFAULT 640,
	"batch_size" integer DEFAULT 16,
	"epochs" integer DEFAULT 100,
	"learning_rate" double precision DEFAULT 0.001,
	"optimizer" varchar(50) DEFAULT 'adam',
	"weight_decay" double precision DEFAULT 0.0005,
	"augmentation_config" jsonb,
	"iou_threshold" double precision DEFAULT 0.5,
	"confidence_threshold" double precision DEFAULT 0.5,
	"random_seed" integer DEFAULT 42,
	"status" varchar(50) DEFAULT 'created',
	"current_epoch" integer DEFAULT 0,
	"train_loss" double precision,
	"val_loss" double precision,
	"box_loss" double precision,
	"objectness_loss" double precision,
	"class_loss" double precision,
	"precision" double precision,
	"recall" double precision,
	"f1" double precision,
	"iou" double precision,
	"best_val_score" double precision,
	"training_duration" integer,
	"hardware" varchar(255),
	"is_demo" boolean DEFAULT false,
	"config" jsonb,
	"results" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "experiments_experiment_id_unique" UNIQUE("experiment_id")
);
--> statement-breakpoint
CREATE TABLE "images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid,
	"filename" varchar(500) NOT NULL,
	"original_filename" varchar(500),
	"filepath" text,
	"resolution" varchar(50),
	"width" integer,
	"height" integer,
	"file_size" integer,
	"mime_type" varchar(50),
	"image_hash" varchar(64),
	"perceptual_hash" varchar(64),
	"capture_timestamp" timestamp,
	"device" varchar(255),
	"split_type" varchar(20),
	"class_status" varchar(50) DEFAULT 'unassigned',
	"annotation_status" varchar(50) DEFAULT 'unannotated',
	"quality_status" varchar(20) DEFAULT 'pending',
	"is_demo" boolean DEFAULT false,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "inference_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" uuid,
	"image_id" uuid,
	"detections" jsonb,
	"num_detections" integer DEFAULT 0,
	"inference_time_ms" double precision,
	"image_width" integer,
	"image_height" integer,
	"model_version" varchar(20),
	"is_demo" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "kaggle_publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid,
	"dataset_version" varchar(20),
	"kaggle_username" varchar(255),
	"kaggle_slug" varchar(255),
	"kaggle_title" varchar(500),
	"kaggle_url" text,
	"status" varchar(50) DEFAULT 'not_published',
	"published_at" timestamp,
	"verified_at" timestamp,
	"last_error" text,
	"export_dir" text,
	"notebook_slug" varchar(255),
	"notebook_url" text,
	"notebook_status" varchar(50) DEFAULT 'not_generated',
	"notebook_published_at" timestamp,
	"notebook_verified_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"version" varchar(20) DEFAULT '1.0',
	"architecture" text,
	"dataset_id" uuid,
	"experiment_id" uuid,
	"parameter_count" integer,
	"image_size" integer DEFAULT 640,
	"num_classes" integer,
	"class_names" jsonb,
	"status" varchar(50) DEFAULT 'training',
	"precision" double precision,
	"recall" double precision,
	"f1" double precision,
	"iou" double precision,
	"map_score" double precision,
	"inference_time_ms" double precision,
	"checkpoint_path" text,
	"best_checkpoint_path" text,
	"is_from_scratch" boolean DEFAULT true,
	"uses_pretrained" boolean DEFAULT false,
	"training_duration" integer,
	"hardware" varchar(255),
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "models_model_id_unique" UNIQUE("model_id")
);
--> statement-breakpoint
CREATE TABLE "quality_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"image_id" uuid,
	"dataset_id" uuid,
	"brightness" double precision,
	"contrast" double precision,
	"blur_score" double precision,
	"sharpness" double precision,
	"noise_estimate" double precision,
	"entropy" double precision,
	"exposure_estimate" double precision,
	"aspect_ratio" double precision,
	"is_blurry" boolean DEFAULT false,
	"is_dark" boolean DEFAULT false,
	"is_overexposed" boolean DEFAULT false,
	"is_tiny" boolean DEFAULT false,
	"is_corrupt" boolean DEFAULT false,
	"is_duplicate" boolean DEFAULT false,
	"quality_score" double precision,
	"quality_flag" varchar(10) DEFAULT 'green',
	"review_notes" text,
	"reviewed_by" varchar(255),
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "system_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(255) NOT NULL,
	"value" jsonb,
	"description" text,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "system_config_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "training_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" uuid,
	"epoch" integer NOT NULL,
	"train_loss" double precision,
	"val_loss" double precision,
	"box_loss" double precision,
	"objectness_loss" double precision,
	"class_loss" double precision,
	"precision" double precision,
	"recall" double precision,
	"f1" double precision,
	"iou" double precision,
	"learning_rate" double precision,
	"timestamp" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "annotation_validations" ADD CONSTRAINT "annotation_validations_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_image_id_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."images"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_splits" ADD CONSTRAINT "dataset_splits_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_versions" ADD CONSTRAINT "dataset_versions_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_groups" ADD CONSTRAINT "duplicate_groups_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "images" ADD CONSTRAINT "images_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inference_runs" ADD CONSTRAINT "inference_runs_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kaggle_publications" ADD CONSTRAINT "kaggle_publications_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "models" ADD CONSTRAINT "models_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "models" ADD CONSTRAINT "models_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_reports" ADD CONSTRAINT "quality_reports_image_id_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."images"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_reports" ADD CONSTRAINT "quality_reports_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_metrics" ADD CONSTRAINT "training_metrics_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE no action ON UPDATE no action;