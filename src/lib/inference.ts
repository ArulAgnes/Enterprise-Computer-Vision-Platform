/**
 * VisionBharat V2 — universal inference helper
 * ============================================
 * Shared by `/api/infer` (upload + paste + live webcam) and `/api/inference`
 * (dataset-image inference) so both speak to `ai/infer.py` the same way.
 */
import fs from "fs";
import path from "path";

import { AI_DIR, BEST_PT, CHECKPOINTS_DIR, INFERENCE_OUTPUT_DIR, VISIONBHARAT_V2_BEST, ensureDir } from "@/lib/paths";
import { ensureClasses, parsePrefixedJson, runPython, getOrCreateDataset } from "@/lib/ai-pipeline";
import { db } from "@/db";
import { inferenceRuns, models } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export interface Detection {
  class: string;
  class_id: number;
  confidence: number;
  bbox: [number, number, number, number];
}

export interface InferenceOutcome {
  ok: boolean;
  predictions: Detection[];
  annotatedImagePath: string | null;
  annotatedImageUrl: string | null;
  timeMs: number;
  imageWidth: number;
  imageHeight: number;
  classes: string[];
  modelPath: string;
  raw: Record<string, unknown> | null;
  error?: string;
  logs: string[];
}

export interface InferenceInput {
  imagePath?: string | null;
  base64?: string | null;
  confidence?: number;
  iou?: number;
  modelPath?: string | null;
  saveAnnotated?: boolean;
}

/** Pick the checkpoint to use: explicit path -> DB model -> ai/checkpoints/best.pt -> models/. */
export async function resolveCheckpoint(explicit?: string | null): Promise<string | null> {
  if (explicit && fs.existsSync(explicit)) return explicit;
  try {
    const rows = await db.select().from(models).orderBy(desc(models.createdAt)).limit(5);
    const withCheckpoint = rows.find((r) => r.checkpointPath && fs.existsSync(r.checkpointPath));
    if (withCheckpoint?.checkpointPath) return withCheckpoint.checkpointPath;
  } catch {
    /* database may be unavailable — fall through to the file system */
  }
  if (fs.existsSync(BEST_PT)) return BEST_PT;
  if (fs.existsSync(VISIONBHARAT_V2_BEST)) return VISIONBHARAT_V2_BEST;
  const epoch10 = path.join(CHECKPOINTS_DIR, "epoch_10.pt");
  return fs.existsSync(epoch10) ? epoch10 : null;
}

export function publicUrlForAnnotated(filePath: string): string {
  return `/api/serve/inference/${path.basename(filePath)}`;
}

export async function runInference(input: InferenceInput): Promise<InferenceOutcome> {
  const logs: string[] = [];
  const modelPath = await resolveCheckpoint(input.modelPath);

  if (!modelPath) {
    return {
      ok: false,
      predictions: [],
      annotatedImagePath: null,
      annotatedImageUrl: null,
      timeMs: 0,
      imageWidth: 0,
      imageHeight: 0,
      classes: [],
      modelPath: "",
      raw: null,
      error: "No trained checkpoint found — run the one-click pipeline first (ai/checkpoints/best.pt).",
      logs,
    };
  }

  const dataset = await getOrCreateDataset();
  const classList = await ensureClasses(dataset.id);
  ensureDir(INFERENCE_OUTPUT_DIR);

  const args = [
    "--model", modelPath,
    "--num_classes", String(classList.length),
    "--class_names", classList.join(","),
    "--conf", String(input.confidence ?? 0.25),
    "--iou", String(input.iou ?? 0.45),
    "--output", INFERENCE_OUTPUT_DIR,
  ];
  if (input.imagePath) args.push("--image", input.imagePath);
  if (input.base64) args.push("--base64", input.base64);
  if (input.saveAnnotated === false) args.push("--no-save");

  const started = Date.now();
  const run = await runPython("infer.py", args, {
    cwd: AI_DIR,
    onLine: (line) => logs.push(line),
    timeoutMs: 180 * 1000,
  });

  const parsed = parsePrefixedJson<Record<string, unknown>>(run.lines, "VBINFER_RESULT:");
  const plainJson = (() => {
    for (let i = run.lines.length - 1; i >= 0; i--) {
      const line = run.lines[i].trim();
      if (line.startsWith("{") && line.includes("\"predictions\"")) {
        try {
          return JSON.parse(line) as Record<string, unknown>;
        } catch {
          /* keep looking */
        }
      }
    }
    return null;
  })();

  const payload = parsed ?? plainJson;
  if (!payload || payload.status === "error") {
    return {
      ok: false,
      predictions: [],
      annotatedImagePath: null,
      annotatedImageUrl: null,
      timeMs: Date.now() - started,
      imageWidth: 0,
      imageHeight: 0,
      classes: classList,
      modelPath,
      raw: payload,
      error: (payload?.error as string) || run.error || "Inference failed",
      logs,
    };
  }

  const predictions = ((payload.predictions as Detection[]) || (payload.detections as Detection[]) || []).map((p) => ({
    class: p.class,
    class_id: p.class_id ?? 0,
    confidence: p.confidence,
    bbox: p.bbox,
  }));
  const annotatedPath = (payload.annotated_image_path as string) || null;

  // Persist the run so the models page can show live inference statistics.
  try {
    await db.insert(inferenceRuns).values({
      imageId: null,
      detections: predictions as unknown as Record<string, unknown>[],
      numDetections: predictions.length,
      inferenceTimeMs: Number(payload.inference_time_ms ?? 0),
      imageWidth: Number(payload.image_width ?? 0),
      imageHeight: Number(payload.image_height ?? 0),
      modelVersion: "2.0",
      isDemo: false,
    });
  } catch {
    /* non-fatal */
  }

  return {
    ok: true,
    predictions,
    annotatedImagePath: annotatedPath,
    annotatedImageUrl: annotatedPath ? publicUrlForAnnotated(annotatedPath) : null,
    timeMs: Number(payload.time_ms ?? payload.inference_time_ms ?? Date.now() - started),
    imageWidth: Number(payload.image_width ?? 0),
    imageHeight: Number(payload.image_height ?? 0),
    classes: classList,
    modelPath,
    raw: payload,
    logs,
  };
}

/** Save an uploaded file / base64 payload to a temp file that python can read. */
export function writeTempImage(buffer: Buffer, ext = ".jpg"): string {
  const dir = ensureDir(path.join(process.cwd(), ".visionbharat-tmp"));
  const file = path.join(dir, `infer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
  fs.writeFileSync(file, buffer);
  return file;
}

export function extensionFor(mimeType: string | null | undefined, fallback = ".jpg"): string {
  if (!mimeType) return fallback;
  if (mimeType.includes("png")) return ".png";
  if (mimeType.includes("webp")) return ".webp";
  if (mimeType.includes("bmp")) return ".bmp";
  return ".jpg";
}

export async function latestInferenceStats() {
  try {
    const rows = await db.select().from(inferenceRuns).orderBy(desc(inferenceRuns.createdAt)).limit(50);
    const total = rows.length;
    const detections = rows.reduce((sum, r) => sum + (r.numDetections ?? 0), 0);
    const avgMs = total > 0 ? rows.reduce((s, r) => s + (r.inferenceTimeMs ?? 0), 0) / total : 0;
    return { total, detections, avgMs: Math.round(avgMs * 100) / 100 };
  } catch {
    return { total: 0, detections: 0, avgMs: 0 };
  }
}
