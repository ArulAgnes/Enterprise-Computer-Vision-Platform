/**
 * VisionBharat V2 — Autonomous AI pipeline library
 * ================================================
 * One place that owns every step of the data-first loop, so the individual
 * routes (`/api/augment`, `/api/split`, `/api/train`, `/api/evaluate`) and the
 * one-click master route (`/api/pipeline/run`) all execute the *same* logic —
 * no duplicated code paths, no "UI-only" steps.
 *
 *   1. scanCapturedPhotos()  — D:\IEEE\100%Project\captured_photos -> images table
 *   2. ensureClasses()       — dynamic class list (never hardcoded)
 *   3. runAugmentation()     — INVENTION 1, 10 annotated -> 100 synthetic (bbox-safe)
 *   4. runAutoSplit()        — INVENTION 4, leakage-free stratified 70/15/15
 *   5. runTraining()         — VisionBharat V2 (5.5M params, from scratch)
 *   6. runEvaluation()       — real mAP / precision / recall / confusion matrix
 */
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "child_process";
import crypto from "crypto";
import fs from "fs";
import path from "path";

import { db } from "@/db";
import { annotations, classes, datasetSplits, datasetVersions, datasets, evaluations, images, models } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";

import {
  AI_DIR,
  AUGMENTED_DIR,
  CAPTURED_PHOTOS_DIR,
  CHECKPOINTS_DIR,
  INFERENCE_OUTPUT_DIR,
  MODELS_DIR,
  PROJECT_ROOT,
  PYTHON_EXECUTABLE,
  SPLIT_DIR,
  VISIONBHARAT_V2_BEST,
  BEST_PT,
  classFromFolder,
  ensureDir,
  FOLDER_CLASS_MAP,
} from "@/lib/paths";
import { DEFAULT_CLASSES, loadClassList } from "@/lib/classes";

export const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".bmp"];
export const ANNOTATION_TARGET = 10; // minimum annotated images required by the engine
export const DEFAULT_AUGMENT_TARGET = 100;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnnotationBox {
  class_name: string;
  class_id: number;
  bbox: [number, number, number, number];
}

export interface AnnotatedImageEntry {
  id: string;
  file_name: string;
  file_path: string;
  width: number;
  height: number;
  class_name: string;
  parent_image_id: string | null;
  is_augmented: boolean;
  sha256?: string | null;
  annotations: AnnotationBox[];
}

export interface AugmentationResult {
  status: string;
  requested: number;
  generated: number;
  rejected: number;
  duplicates: number;
  total: number;
  original: number;
  engine: string;
  per_class: Record<string, number>;
  images: Array<{
    id: string;
    filename: string;
    url: string;
    className: string;
    parentImageId: string | null;
    annotations: number;
    width: number;
    height: number;
    transform: string;
  }>;
  preview: string[];
  jsonPath: string;
  logs: string[];
  alreadyPresent?: number;
}

export interface SplitResult {
  status: string;
  train: number;
  val: number;
  test: number;
  total: number;
  leakage: string;
  leakageDetected: boolean;
  stratified: boolean;
  attempts: number;
  method: string;
  versionId: string;
  version: string;
  files: Record<string, string>;
  classDistribution: Record<string, Record<string, number>>;
  groups: { total: number; derived: number };
  logs: string[];
}

export interface TrainingResult {
  ok: boolean;
  epochsRun: number;
  bestValMap50: number;
  bestEpoch: number;
  parameters: number;
  durationSeconds: number;
  checkpointPaths: string[];
  report: Record<string, unknown> | null;
  history: Array<Record<string, number>>;
  logs: string[];
  error?: string;
}

export interface EvaluationResult {
  ok: boolean;
  precision: number;
  recall: number;
  f1: number;
  accuracy: number;
  map50: number;
  map5095: number;
  meanIou: number;
  perClass: Record<string, Record<string, number>>;
  confusionMatrix: number[][];
  errorAnalysis: Record<string, unknown>;
  latencyMs: Record<string, number>;
  images: number;
  raw: Record<string, unknown> | null;
  outputPath?: string;
  logs: string[];
  error?: string;
}

export interface StepUpdate {
  id: string;
  label: string;
  status: "pending" | "running" | "done" | "error" | "waiting";
  detail?: string;
  data?: Record<string, unknown>;
}

export type StepListener = (update: StepUpdate) => void;

// ---------------------------------------------------------------------------
// Python execution helpers
// ---------------------------------------------------------------------------

export interface PythonRunOptions {
  timeoutMs?: number;
  cwd?: string;
  onLine?: (line: string) => void;
  env?: Record<string, string>;
}

export interface PythonRunResult {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  lines: string[];
  json: Record<string, unknown> | null;
  error?: string;
}

/** Extract the last JSON object printed on a line with the given prefix. */
export function parsePrefixedJson<T = Record<string, unknown>>(lines: string[], prefix: string): T | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    const idx = line.indexOf(prefix);
    if (idx === -1) continue;
    const payload = line.slice(idx + prefix.length).trim();
    try {
      return JSON.parse(payload) as T;
    } catch {
      // keep looking
    }
  }
  return null;
}

/** Run a python script and capture its output, streaming lines to `onLine`. */
export function runPython(script: string, args: string[], options: PythonRunOptions = {}): Promise<PythonRunResult> {
  const scriptPath = path.isAbsolute(script) ? script : path.join(AI_DIR, script);
  const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
  const cwd = options.cwd ?? AI_DIR;

  return new Promise<PythonRunResult>((resolve) => {
    const lines: string[] = [];
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    let finished = false;

    const child = spawn(PYTHON_EXECUTABLE, [scriptPath, ...args], {
      cwd,
      env: { ...process.env, PYTHONUNBUFFERED: "1", PYTHONIOENCODING: "utf-8", ...(options.env || {}) },
      windowsHide: true,
    });

    const timer = setTimeout(() => {
      if (!finished) {
        child.kill("SIGKILL");
        lines.push(`[timeout] python exceeded ${Math.round(timeoutMs / 1000)}s and was killed`);
      }
    }, timeoutMs);

    const handle = (prefix: string) => (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      if (prefix === "out") stdoutChunks.push(text);
      else stderrChunks.push(text);
      for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trimEnd();
        if (!line) continue;
        lines.push(line);
        options.onLine?.(line);
      }
    };

    child.stdout?.on("data", handle("out"));
    child.stderr?.on("data", handle("err"));

    child.on("error", (err) => {
      finished = true;
      clearTimeout(timer);
      resolve({
        ok: false,
        code: null,
        stdout: stdoutChunks.join(""),
        stderr: stderrChunks.join(""),
        lines,
        json: null,
        error: `failed to start python (${PYTHON_EXECUTABLE}): ${err.message}`,
      });
    });

    child.on("close", (code) => {
      finished = true;
      clearTimeout(timer);
      resolve({
        ok: code === 0,
        code,
        stdout: stdoutChunks.join(""),
        stderr: stderrChunks.join(""),
        lines,
        json: null,
        error: code === 0 ? undefined : `python exited with code ${code}`,
      });
    });
  });
}

/** Spawn a long-running python process (used by training) and stream its lines. */
export function spawnPython(
  script: string,
  args: string[],
  options: { cwd?: string; env?: Record<string, string> } = {}
): ChildProcessWithoutNullStreams {
  const scriptPath = path.isAbsolute(script) ? script : path.join(AI_DIR, script);
  return spawn(PYTHON_EXECUTABLE, [scriptPath, ...args], {
    cwd: options.cwd ?? AI_DIR,
    env: { ...process.env, PYTHONUNBUFFERED: "1", PYTHONIOENCODING: "utf-8", ...(options.env || {}) },
    windowsHide: true,
  }) as ChildProcessWithoutNullStreams;
}

/** Quick synchronous sanity check that python + torch are importable. */
export function pythonAvailable(): boolean {
  try {
    const res = spawnSync(PYTHON_EXECUTABLE, ["-c", "import torch, cv2; print('ok')"], {
      encoding: "utf-8",
      timeout: 60_000,
    });
    return res.status === 0 && (res.stdout || "").includes("ok");
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Dataset / classes
// ---------------------------------------------------------------------------

/** Ensure the demo/competition dataset row exists and return it. */
export async function getOrCreateDataset(name = "VisionBharat Ritual Objects", publicId = "VISIONBHARAT-V2") {
  const existing = await db.select().from(datasets).where(eq(datasets.datasetId, publicId)).limit(1);
  if (existing.length > 0) return existing[0];

  const [created] = await db
    .insert(datasets)
    .values({
      name,
      datasetId: publicId,
      theme: "Indian ritual objects — temple bells & oil lamps (diyas)",
      description:
        "Team-captured dataset (bell / oillamp) expanded by the Annotation-Aware Synthetic Expansion Engine.",
      collectionLocation: "Rajapalayam, Tamil Nadu, India",
      collectionDate: new Date(),
      photographer: "Arul Maria Agnes",
      device: "Team smartphone cameras",
      defaultResolution: "4032x3024",
      lightingCondition: "Mixed indoor / daylight",
      environment: "Temple & home shrine",
      notes: "26 team-captured photographs, from-scratch training only, no external data.",
      status: "active",
      version: "2.0",
      isDemo: false,
    })
    .returning();
  return created;
}

/**
 * Ensure the `classes` rows exist for a dataset.
 * Classes are ALWAYS resolved dynamically; DEFAULT_CLASSES is only a fallback.
 */
export async function ensureClasses(datasetId: string): Promise<string[]> {
  const declared = await db.select().from(classes).where(eq(classes.datasetId, datasetId)).orderBy(classes.classIndex);
  const fromDb = declared.map((c) => c.name).filter(Boolean);

  // Merge in any class referenced by existing annotations.
  const annotated = await db.execute(sql`
    SELECT DISTINCT class_name FROM annotations
    WHERE dataset_id = ${datasetId} AND class_name IS NOT NULL
  `);
  const fromAnnotations = ((annotated as unknown as { rows: Array<{ class_name: string }> }).rows || [])
    .map((r) => r.class_name)
    .filter(Boolean);

  const wanted = new Set<string>([...fromDb, ...fromAnnotations]);
  if (wanted.size === 0) {
    for (const name of await loadClassList(datasetId)) wanted.add(name);
  }
  const list = Array.from(wanted);

  const missing = list.filter((name) => !fromDb.includes(name));
  if (missing.length > 0) {
    let nextIndex = declared.reduce((max, c) => Math.max(max, c.classIndex ?? 0), -1) + 1;
    await db.insert(classes).values(
      missing.map((name) => ({
        datasetId,
        name,
        classIndex: nextIndex++,
        description: `Auto-registered class '${name}'`,
        color: null,
      }))
    );
  }
  return list;
}

// ---------------------------------------------------------------------------
// STEP 1 — scan the captured photos folder
// ---------------------------------------------------------------------------

export interface ScanResult {
  root: string;
  scanned: number;
  inserted: number;
  skipped: number;
  perFolder: Record<string, { class: string; count: number; inserted: number }>;
  images: Array<{ id: string; filename: string; className: string; filepath: string }>;
  logs: string[];
}

export async function scanCapturedPhotos(datasetId: string, root?: string): Promise<ScanResult> {
  const photosRoot = root || CAPTURED_PHOTOS_DIR;
  const logs: string[] = [`[scan] root: ${photosRoot}`];
  const perFolder: ScanResult["perFolder"] = {};
  const insertedRows: ScanResult["images"] = [];
  let scanned = 0;
  let inserted = 0;
  let skipped = 0;

  if (!fs.existsSync(photosRoot)) {
    logs.push(`[scan] WARNING: folder not found (${photosRoot})`);
    return { root: photosRoot, scanned: 0, inserted: 0, skipped: 0, perFolder, images: [], logs };
  }

  const folderEntries = fs
    .readdirSync(photosRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.toLowerCase() !== "augmented");

  const existing = await db.select({ filepath: images.filepath, filename: images.filename }).from(images).where(eq(images.datasetId, datasetId));
  const knownPaths = new Set(existing.map((r) => (r.filepath || "").toLowerCase()));
  const knownNames = new Set(existing.map((r) => (r.filename || "").toLowerCase()));

  for (const folder of folderEntries) {
    const className = classFromFolder(folder.name);
    const folderPath = path.join(photosRoot, folder.name);
    const files = fs
      .readdirSync(folderPath)
      .filter((f) => IMAGE_EXTENSIONS.includes(path.extname(f).toLowerCase()))
      .sort();

    let folderInserted = 0;
    for (const file of files) {
      scanned += 1;
      const full = path.join(folderPath, file);
      if (knownPaths.has(full.toLowerCase()) || knownNames.has(file.toLowerCase())) {
        skipped += 1;
        continue;
      }
      const buffer = fs.readFileSync(full);
      const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
      const { width, height } = readImageSize(buffer);

      const [row] = await db
        .insert(images)
        .values({
          datasetId,
          filename: file,
          originalFilename: file,
          filepath: full,
          resolution: width && height ? `${width}x${height}` : null,
          width: width || null,
          height: height || null,
          fileSize: buffer.length,
          mimeType: path.extname(file).toLowerCase() === ".png" ? "image/png" : "image/jpeg",
          imageHash: sha256,
          splitType: "unassigned",
          classStatus: className,
          annotationStatus: "unannotated",
          qualityStatus: "pending",
          isDemo: false,
          metadata: { sourceFolder: folder.name, className, origin: "captured_photos" },
        })
        .returning();

      insertedRows.push({ id: row.id, filename: file, className, filepath: full });
      knownPaths.add(full.toLowerCase());
      knownNames.add(file.toLowerCase());
      inserted += 1;
      folderInserted += 1;
    }

    perFolder[folder.name] = { class: className, count: files.length, inserted: folderInserted };
    logs.push(`[scan] ${folder.name}/ -> class '${className}': ${files.length} files (${folderInserted} new)`);
  }

  await db
    .update(datasets)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(datasets.id, datasetId));

  logs.push(`[scan] done: scanned=${scanned} inserted=${inserted} already-present=${skipped}`);
  return { root: photosRoot, scanned, inserted, skipped, perFolder, images: insertedRows, logs };
}

/** Read intrinsic size from JPEG/PNG/WebP headers without extra dependencies. */
export function readImageSize(buffer: Buffer): { width: number; height: number } {
  try {
    // PNG
    if (buffer.length > 24 && buffer[0] === 0x89 && buffer[1] === 0x50) {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
    // JPEG — walk the segment markers
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      offset += 2 + length;
    }
  } catch {
    // fall through
  }
  return { width: 0, height: 0 };
}

// ---------------------------------------------------------------------------
// STEP 2 — gather annotations (dynamic, version-aware)
// ---------------------------------------------------------------------------

export interface VersionResolution {
  datasetId: string;
  versionId: string | null;
  version: string | null;
}

/**
 * Resolve the dataset/version a pipeline call works with.
 * `datasetVersionId` may be a dataset_versions UUID, a public dataset id, or the
 * internal dataset UUID — all of them map to a dataset + version pair.
 */
export async function resolveVersion(datasetVersionId?: string | null): Promise<VersionResolution> {
  if (datasetVersionId) {
    const byVersion = await db.select().from(datasetVersions).where(eq(datasetVersions.id, datasetVersionId)).limit(1);
    if (byVersion.length > 0 && byVersion[0].datasetId) {
      return { datasetId: byVersion[0].datasetId, versionId: byVersion[0].id, version: byVersion[0].version };
    }
    const byDataset = await db.select().from(datasets).where(eq(datasets.id, datasetVersionId)).limit(1);
    if (byDataset.length > 0) return { datasetId: byDataset[0].id, versionId: null, version: byDataset[0].version };
    const byPublic = await db.select().from(datasets).where(eq(datasets.datasetId, datasetVersionId)).limit(1);
    if (byPublic.length > 0) return { datasetId: byPublic[0].id, versionId: null, version: byPublic[0].version };
  }
  const ds = await getOrCreateDataset();
  return { datasetId: ds.id, versionId: null, version: ds.version };
}

export interface AnnotationPayload {
  jsonPath: string;
  annotatedImages: number;
  totalImages: number;
  classList: string[];
  entries: AnnotatedImageEntry[];
}

/**
 * Build the annotation JSON consumed by the augmentation engine and the splitter.
 * Only images that actually carry at least one annotation are included.
 */
export async function buildAnnotationPayload(datasetId: string, outFile?: string): Promise<AnnotationPayload> {
  const classList = await ensureClasses(datasetId);
  const classIndex = new Map(classList.map((name, i) => [name, i]));

  // Only HAND-annotated originals are expansion sources: synthetic samples are
  // never re-expanded (that is how you accidentally turn 100 images into 1000).
  const rows = await db.execute(sql`
    SELECT i.id, i.filename, i.filepath, i.width, i.height, i.image_hash, i.perceptual_hash,
           i.parent_image_id, i.is_augmented, i.annotation_status,
           a.class_name, a.x, a.y, a.width AS box_w, a.height AS box_h
    FROM images i
    LEFT JOIN annotations a ON a.image_id = i.id
    WHERE i.dataset_id = ${datasetId} AND COALESCE(i.is_augmented, false) = false
    ORDER BY i.created_at ASC
  `);

  type Row = {
    id: string;
    filename: string;
    filepath: string | null;
    width: number | null;
    height: number | null;
    image_hash: string | null;
    perceptual_hash: string | null;
    parent_image_id: string | null;
    is_augmented: boolean | null;
    annotation_status: string | null;
    class_name: string | null;
    x: number | null;
    y: number | null;
    box_w: number | null;
    box_h: number | null;
  };
  const resultRows = ((rows as unknown as { rows: Row[] }).rows || []) as Row[];

  const byImage = new Map<string, AnnotatedImageEntry>();
  for (const row of resultRows) {
    if (!byImage.has(row.id)) {
      byImage.set(row.id, {
        id: row.id,
        file_name: row.filename,
        file_path: row.filepath || "",
        width: row.width || 0,
        height: row.height || 0,
        class_name: "",
        parent_image_id: row.parent_image_id || null,
        is_augmented: !!row.is_augmented,
        sha256: row.image_hash,
        annotations: [],
      });
    }
    const entry = byImage.get(row.id)!;
    if (row.class_name && row.x !== null && row.box_w !== null) {
      entry.annotations.push({
        class_name: row.class_name,
        class_id: classIndex.get(row.class_name) ?? 0,
        bbox: [Number(row.x), Number(row.y), Number(row.box_w), Number(row.box_h)],
      });
    }
  }

  const all = Array.from(byImage.values()).filter((e) => e.file_path && fs.existsSync(e.file_path));
  const annotated = all.filter((e) => e.annotations.length > 0);
  for (const entry of annotated) {
    const counts = new Map<string, number>();
    for (const a of entry.annotations) counts.set(a.class_name, (counts.get(a.class_name) ?? 0) + 1);
    entry.class_name = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? classList[0];
  }

  const tmpDir = ensureDir(path.join(PROJECT_ROOT, ".visionbharat-tmp"));
  const jsonPath = outFile || path.join(tmpDir, `annotations_${Date.now()}.json`);
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        dataset_id: datasetId,
        generated_at: new Date().toISOString(),
        classes: classList,
        categories: classList.map((name, i) => ({ id: i, name })),
        images: annotated,
      },
      null,
      2
    )
  );

  return {
    jsonPath,
    annotatedImages: annotated.length,
    totalImages: all.length,
    classList,
    entries: annotated,
  };
}

export async function countAnnotated(datasetId: string): Promise<{
  annotated: number;
  annotatedTotal: number;
  augmented: number;
  total: number;
}> {
  const result = await db.execute(sql`
    SELECT
      count(DISTINCT i.id)::int AS total,
      count(DISTINCT CASE WHEN i.annotation_status = 'annotated' THEN i.id END)::int AS annotated,
      count(DISTINCT CASE WHEN i.annotation_status = 'annotated' AND COALESCE(i.is_augmented, false) = false
                          THEN i.id END)::int AS original_annotated,
      count(DISTINCT CASE WHEN COALESCE(i.is_augmented, false) THEN i.id END)::int AS augmented
    FROM images i WHERE i.dataset_id = ${datasetId}
  `);
  const row = ((result as unknown as { rows: Array<{ total: number; annotated: number; original_annotated: number; augmented: number }> }).rows || [])[0];
  return {
    // `annotated` is the number of HAND-annotated originals (the 10-image gate),
    // `annotatedTotal` includes the synthetic samples whose boxes ship with them.
    annotated: row?.original_annotated ?? 0,
    annotatedTotal: row?.annotated ?? 0,
    augmented: row?.augmented ?? 0,
    total: row?.total ?? 0,
  };
}

// ---------------------------------------------------------------------------
// STEP 2b — annotation accelerator (classical CV proposals)
// ---------------------------------------------------------------------------

export interface AutoAnnotateResult {
  ok: boolean;
  proposed: number;
  inserted: number;
  perClass: Record<string, number>;
  engine: string;
  proposals: Array<{
    file_path: string;
    file_name: string;
    class_name: string;
    bbox: [number, number, number, number];
    confidence: number;
    method: string;
    width?: number;
    height?: number;
  }>;
  logs: string[];
  error?: string;
}

/**
 * Propose bounding boxes with classical computer vision (`ai/auto_annotate.py`)
 * and store them as editable annotations.
 *
 * This is a *proposal* pass: the boxes are real detections produced by a
 * from-scratch Lab-saliency + Otsu pipeline (no pretrained model involved), and
 * a human can refine every box in the Annotation Studio afterwards. It exists so
 * the autonomous pipeline never blocks on a manual click.
 */
export async function autoAnnotateImages(
  datasetId: string,
  options: { limit?: number; perClass?: number; imagesRoot?: string; minConfidence?: number; onLine?: (line: string) => void } = {}
): Promise<AutoAnnotateResult> {
  const logs: string[] = [];
  const classList = await ensureClasses(datasetId);
  const imagesRoot = options.imagesRoot || CAPTURED_PHOTOS_DIR;
  const classMap = Object.keys(FOLDER_CLASS_MAP)
    .map((folder) => `${folder}=${FOLDER_CLASS_MAP[folder]}`)
    .join(",");

  const args = [
    "--images", imagesRoot,
    "--class-map", classMap,
    "--min-confidence", String(options.minConfidence ?? 0.4),
  ];
  if (options.perClass) args.push("--per-class", String(options.perClass));
  if (options.limit) args.push("--limit", String(options.limit));

  const run = await runPython("auto_annotate.py", args, {
    onLine: (line) => {
      logs.push(line);
      options.onLine?.(line);
    },
    timeoutMs: 10 * 60 * 1000,
  });

  const parsed = parsePrefixedJson<Record<string, unknown>>(run.lines, "VBAUTO_RESULT:");
  if (!run.ok || !parsed || parsed.status !== "ok") {
    return {
      ok: false, proposed: 0, inserted: 0, perClass: {}, engine: "none", proposals: [], logs,
      error: run.error || "auto annotation failed",
    };
  }

  const proposals = (parsed.proposals as AutoAnnotateResult["proposals"]) || [];
  const imageRows = await db
    .select({ id: images.id, filepath: images.filepath, filename: images.filename })
    .from(images)
    .where(eq(images.datasetId, datasetId));
  const byPath = new Map(imageRows.map((r) => [(r.filepath || "").toLowerCase(), r]));
  const byName = new Map(imageRows.map((r) => [r.filename.toLowerCase(), r]));

  let inserted = 0;
  const perClass: Record<string, number> = {};
  const accepted: AutoAnnotateResult["proposals"] = [];

  for (const proposal of proposals) {
    const row = byPath.get(proposal.file_path.toLowerCase()) || byName.get(proposal.file_name.toLowerCase());
    if (!row) continue;
    const className = classList.includes(proposal.class_name) ? proposal.class_name : classList[0];
    const [x, y, w, h] = proposal.bbox;

    // Skip when this image already carries a human annotation (never overwrite).
    const existing = await db.select({ id: annotations.id }).from(annotations).where(eq(annotations.imageId, row.id)).limit(1);
    if (existing.length > 0) continue;

    await db.insert(annotations).values({
      imageId: row.id,
      datasetId,
      className,
      x, y, width: w, height: h,
      normalizedX: proposal.bbox[0] / Math.max(1, proposal.width ?? 1),
      normalizedY: proposal.bbox[1] / Math.max(1, proposal.height ?? 1),
      normalizedW: w / Math.max(1, proposal.width ?? 1),
      normalizedH: h / Math.max(1, proposal.height ?? 1),
      isValid: true,
      annotator: "auto_annotate_proposal (classical CV)",
    });
    await db.update(images).set({ annotationStatus: "annotated", classStatus: className, updatedAt: new Date() }).where(eq(images.id, row.id));
    inserted += 1;
    perClass[className] = (perClass[className] ?? 0) + 1;
    accepted.push(proposal);
  }

  logs.push(`[auto-annotate] inserted ${inserted} proposal(s) for ${proposals.length} candidate(s)`);
  return {
    ok: inserted > 0,
    proposed: proposals.length,
    inserted,
    perClass,
    engine: String(parsed.engine || "classical CV"),
    proposals: accepted,
    logs,
  };
}

// ---------------------------------------------------------------------------
// STEP 3 — INVENTION 1: annotation-aware synthetic expansion
// ---------------------------------------------------------------------------

export interface AugmentOptions {
  datasetVersionId?: string | null;
  targetCount?: number;
  onLine?: (line: string) => void;
  imagesRoot?: string;
  outputDir?: string;
}

export async function runAugmentation(options: AugmentOptions): Promise<AugmentationResult & { error?: string; needAnnotation?: boolean; annotatedCount?: number }> {
  const { datasetId } = await resolveVersion(options.datasetVersionId);
  const target = Math.max(1, Math.round(options.targetCount ?? DEFAULT_AUGMENT_TARGET));
  const payload = await buildAnnotationPayload(datasetId);

  if (payload.annotatedImages < ANNOTATION_TARGET) {
    return {
      status: "need_annotation",
      needAnnotation: true,
      annotatedCount: payload.annotatedImages,
      requested: target,
      generated: 0,
      rejected: 0,
      duplicates: 0,
      total: payload.totalImages,
      original: payload.annotatedImages,
      engine: "none",
      per_class: {},
      images: [],
      preview: [],
      jsonPath: payload.jsonPath,
      logs: [`[augment] blocked: ${payload.annotatedImages}/${ANNOTATION_TARGET} annotated images`],
      error: `Need at least ${ANNOTATION_TARGET} annotated images (found ${payload.annotatedImages})`,
    };
  }

  const outputDir = ensureDir(options.outputDir || AUGMENTED_DIR);
  const imagesRoot = options.imagesRoot || CAPTURED_PHOTOS_DIR;
  const logs: string[] = [];

  const run = await runPython(
    "augmentation_engine.py",
    [
      "--input", payload.jsonPath,
      "--images", imagesRoot,
      "--output", outputDir,
      "--target", String(target),
      "--min-box-side", "10",
    ],
    { onLine: (line) => { logs.push(line); options.onLine?.(line); }, timeoutMs: 10 * 60 * 1000 }
  );

  const parsed = parsePrefixedJson<Record<string, unknown>>(run.lines, "VBAUG_RESULT:");
  if (!run.ok || !parsed || parsed.status !== "ok") {
    return {
      status: "error",
      requested: target,
      generated: 0,
      rejected: 0,
      duplicates: 0,
      total: payload.totalImages,
      original: payload.annotatedImages,
      engine: "albumentations",
      per_class: {},
      images: [],
      preview: [],
      jsonPath: payload.jsonPath,
      logs,
      error: (parsed?.error as string) || run.error || "augmentation engine failed",
    };
  }

  const generatedImages = (parsed.images as Array<Record<string, unknown>>) || [];
  const stats = (parsed.stats as Record<string, unknown>) || {};
  const inserted: AugmentationResult["images"] = [];

  // Idempotency: a synthetic sample is identified by its filename inside the
  // dataset, so re-running the pipeline never duplicates the expansion.
  const existingFiles = new Set(
    (await db.select({ filename: images.filename }).from(images).where(eq(images.datasetId, datasetId))).map((r) =>
      r.filename.toLowerCase()
    )
  );
  let alreadyPresent = 0;

  // The augmented images belong to the dataset but are NOT annotated by hand —
  // their boxes come from the engine, so they carry annotations too.
  const tempVersionId: string | null = null;
  const parentIds = new Set(generatedImages.map((g) => String(g.parent_image_id)).filter(Boolean));
  const parentRows = parentIds.size
    ? await db.execute(sql`SELECT id FROM images WHERE dataset_id = ${datasetId}`)
    : null;
  const datasetImageIds = new Set(
    ((parentRows as unknown as { rows: Array<{ id: string }> })?.rows || []).map((r) => r.id)
  );

  for (const gen of generatedImages) {
    const filePath = String(gen.file_path || "");
    if (!filePath || !fs.existsSync(filePath)) continue;
    const fileName = String(gen.file_name || "");
    if (existingFiles.has(fileName.toLowerCase())) {
      alreadyPresent += 1;
      continue;
    }
    const buffer = fs.readFileSync(filePath);
    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
    const parentRaw = gen.parent_image_id ? String(gen.parent_image_id) : null;
    const parentId = parentRaw && datasetImageIds.has(parentRaw) ? parentRaw : null;

    const [row] = await db
      .insert(images)
      .values({
        datasetId,
        filename: String(gen.file_name),
        originalFilename: String(gen.file_name),
        filepath: filePath,
        resolution: `${gen.width}x${gen.height}`,
        width: Number(gen.width) || null,
        height: Number(gen.height) || null,
        fileSize: buffer.length,
        mimeType: "image/jpeg",
        imageHash: sha256,
        perceptualHash: (gen.phash as string) || null,
        splitType: "unassigned",
        classStatus: String(gen.class_name || ""),
        annotationStatus: "annotated", // boxes generated WITH the pixels — always in sync
        qualityStatus: "green",
        isDemo: false,
        parentImageId: parentId,
        isAugmented: true,
        datasetVersionId: tempVersionId,
        metadata: {
          origin: "synthetic_expansion_engine",
          transform: gen.transform,
          parentImageId: parentRaw,
          classCount: (gen.annotations as unknown[])?.length ?? 0,
          bboxPreserved: true,
          invention: "Annotation-Aware Synthetic Expansion Engine",
        },
      })
      .returning();

    const genAnnotations = (gen.annotations as Array<{ class_name: string; class_id: number; bbox: number[] }>) || [];
    if (genAnnotations.length > 0) {
      await db.insert(annotations).values(
        genAnnotations.map((a) => ({
          imageId: row.id,
          datasetId,
          className: a.class_name,
          x: a.bbox[0],
          y: a.bbox[1],
          width: a.bbox[2],
          height: a.bbox[3],
          normalizedX: Number(gen.width) ? a.bbox[0] / Number(gen.width) : null,
          normalizedY: Number(gen.height) ? a.bbox[1] / Number(gen.height) : null,
          normalizedW: Number(gen.width) ? a.bbox[2] / Number(gen.width) : null,
          normalizedH: Number(gen.height) ? a.bbox[3] / Number(gen.height) : null,
          isValid: true,
          annotator: "synthetic_expansion_engine",
        }))
      );
    }

    existingFiles.add(row.filename.toLowerCase());
    inserted.push({
      id: row.id,
      filename: row.filename,
      url: `/api/serve/${datasetId}/${row.filename}?dir=augmented`,
      className: String(gen.class_name || ""),
      parentImageId: parentId,
      annotations: genAnnotations.length,
      width: Number(gen.width) || 0,
      height: Number(gen.height) || 0,
      transform: String(gen.transform || ""),
    });
  }

  const perClass = (stats.per_class as Record<string, number>) || {};
  if (alreadyPresent > 0) {
    logs.push(`[augment] ${alreadyPresent} synthetic sample(s) were already registered — reused, not duplicated`);
  }
  const result: AugmentationResult = {
    status: "ready",
    requested: target,
    generated: inserted.length,
    rejected: Number(stats.rejected || 0),
    duplicates: Number(stats.duplicates || 0),
    total: payload.totalImages + inserted.length,
    original: payload.annotatedImages,
    alreadyPresent,
    engine: String(stats.engine || "albumentations"),
    per_class: perClass,
    images: inserted,
    preview: inserted.slice(0, 3).map((i) => i.url),
    jsonPath: String(parsed.json_path || path.join(outputDir, "augmented_annotations.json")),
    logs,
  };

  logs.push(
    `[augment] generated ${inserted.length}/${target} (rejected=${result.rejected}, duplicates=${result.duplicates}) engine=${result.engine}`
  );
  return result;
}

// ---------------------------------------------------------------------------
// STEP 4 — INVENTION 4: leakage-free stratified auto split
// ---------------------------------------------------------------------------

export interface SplitOptions {
  datasetVersionId?: string | null;
  ratios?: { train: number; val: number; test: number };
  seed?: number;
  onLine?: (line: string) => void;
  minHamming?: number;
}

export async function runAutoSplit(options: SplitOptions): Promise<SplitResult & { error?: string }> {
  const resolved = await resolveVersion(options.datasetVersionId);
  const datasetId = resolved.datasetId;
  const ratios = options.ratios ?? { train: 0.7, val: 0.15, test: 0.15 };
  const seed = options.seed ?? 42;
  const logs: string[] = [];

  const classList = await ensureClasses(datasetId);
  const classIndex = new Map(classList.map((n, i) => [n, i]));

  // Collect every image of the dataset with its annotations + lineage so the
  // splitter can apply group cohesion for synthetic samples.
  const raw = await db.execute(sql`
    SELECT i.id, i.filename, i.filepath, i.width, i.height, i.image_hash, i.perceptual_hash,
           i.parent_image_id, i.is_augmented, a.class_name, a.x, a.y,
           a.width AS box_w, a.height AS box_h
    FROM images i
    LEFT JOIN annotations a ON a.image_id = i.id
    WHERE i.dataset_id = ${datasetId}
    ORDER BY i.created_at ASC
  `);
  type Row = {
    id: string; filename: string; filepath: string | null; width: number | null; height: number | null;
    image_hash: string | null; perceptual_hash: string | null; parent_image_id: string | null;
    is_augmented: boolean | null; class_name: string | null; x: number | null; y: number | null;
    box_w: number | null; box_h: number | null;
  };
  const rows = ((raw as unknown as { rows: Row[] }).rows || []) as Row[];

  const entries = new Map<string, AnnotatedImageEntry>();
  for (const row of rows) {
    if (!entries.has(row.id)) {
      entries.set(row.id, {
        id: row.id,
        file_name: row.filename,
        file_path: row.filepath || "",
        width: row.width || 0,
        height: row.height || 0,
        class_name: "",
        parent_image_id: row.parent_image_id || null,
        is_augmented: !!row.is_augmented,
        sha256: row.image_hash,
        annotations: [],
      });
    }
    const entry = entries.get(row.id)!;
    if (row.class_name && row.x !== null && row.box_w !== null) {
      entry.annotations.push({
        class_name: row.class_name,
        class_id: classIndex.get(row.class_name) ?? 0,
        bbox: [Number(row.x), Number(row.y), Number(row.box_w), Number(row.box_h)],
      });
    }
  }

  const usable = Array.from(entries.values()).filter((e) => e.file_path && fs.existsSync(e.file_path));
  if (usable.length < 3) {
    return {
      status: "error", train: 0, val: 0, test: 0, total: usable.length, leakage: "UNKNOWN",
      leakageDetected: false, stratified: false, attempts: 0, method: "none", versionId: resolved.versionId || "",
      version: resolved.version || "", files: {}, classDistribution: {}, groups: { total: 0, derived: 0 }, logs,
      error: `Need at least 3 images to split (found ${usable.length})`,
    };
  }

  const splitDir = ensureDir(SPLIT_DIR);
  const inputPath = path.join(splitDir, `split_input_${Date.now()}.json`);
  fs.writeFileSync(
    inputPath,
    JSON.stringify(
      {
        classes: classList,
        categories: classList.map((n, i) => ({ id: i, name: n })),
        images: usable.map((e) => ({
          id: e.id,
          file_name: e.file_name,
          file_path: e.file_path,
          width: e.width,
          height: e.height,
          class_name: e.class_name,
          parent_image_id: e.parent_image_id,
          is_augmented: e.is_augmented,
          sha256: e.sha256,
          annotations: e.annotations,
        })),
      },
      null,
      2
    )
  );

  const run = await runPython(
    "split_helper.py",
    [
      "--input", inputPath,
      "--out-dir", splitDir,
      "--ratios", `${ratios.train},${ratios.val},${ratios.test}`,
      "--seed", String(seed),
      "--min-hamming", String(options.minHamming ?? 8),
    ],
    { onLine: (line) => { logs.push(line); options.onLine?.(line); }, timeoutMs: 10 * 60 * 1000 }
  );

  const parsed = parsePrefixedJson<Record<string, unknown>>(run.lines, "VBSPLIT_RESULT:");
  if (!run.ok || !parsed || parsed.status !== "ok") {
    return {
      status: "error", train: 0, val: 0, test: 0, total: usable.length, leakage: "UNKNOWN", leakageDetected: false,
      stratified: false, attempts: 0, method: "none", versionId: resolved.versionId || "",
      version: resolved.version || "", files: {}, classDistribution: {}, groups: { total: 0, derived: 0 }, logs,
      error: (parsed?.error as string) || run.error || "split helper failed",
    };
  }

  const counts = (parsed.counts as Record<string, number>) || {};
  const splits = (parsed.splits as { train: string[]; val: string[]; test: string[] }) || { train: [], val: [], test: [] };
  const fingerprints = (parsed.fingerprints as Record<string, string>) || {};
  const leakageReport = (parsed.leakage_report as Record<string, unknown>) || {};

  // Persist split membership + perceptual hashes on the images table.
  const updates: Array<{ id: string; split: string }> = [
    ...splits.train.map((id) => ({ id, split: "train" })),
    ...splits.val.map((id) => ({ id, split: "val" })),
    ...splits.test.map((id) => ({ id, split: "test" })),
  ];
  for (const update of updates) {
    await db
      .update(images)
      .set({ splitType: update.split, perceptualHash: fingerprints[update.id] || undefined, updatedAt: new Date() })
      .where(eq(images.id, update.id));
  }

  // New immutable dataset version describing this split.
  // `dataset_versions.version` is varchar(20) — keep the label short & readable.
  const versionNumber = `v2.${Date.now().toString().slice(-8)}`;
  const [versionRow] = await db
    .insert(datasetVersions)
    .values({
      datasetId,
      version: versionNumber,
      changeDescription:
        `Auto split (leakage-free, stratified) — train ${counts.train ?? 0} / val ${counts.val ?? 0} / test ${counts.test ?? 0} ` +
        `| ${usable.length} images | groups=${(parsed.groups as Record<string, number>)?.total ?? 0} | method=${parsed.method}`,
      imagesAdded: 0,
      annotationsChanged: 0,
    })
    .returning();

  await db.insert(datasetSplits).values({
    datasetId,
    version: versionNumber,
    trainRatio: ratios.train,
    valRatio: ratios.val,
    testRatio: ratios.test,
    trainCount: counts.train ?? 0,
    valCount: counts.val ?? 0,
    testCount: counts.test ?? 0,
    randomSeed: seed,
    leakageDetected: Boolean(leakageReport.leakage_detected),
    leakageDetails: leakageReport as Record<string, unknown>,
  });

  await db.update(images).set({ datasetVersionId: versionRow.id }).where(eq(images.datasetId, datasetId));

  const result: SplitResult = {
    status: "ok",
    train: counts.train ?? 0,
    val: counts.val ?? 0,
    test: counts.test ?? 0,
    total: counts.total ?? usable.length,
    leakage: String(parsed.leakage || "PASSED"),
    leakageDetected: Boolean(leakageReport.leakage_detected),
    stratified: Boolean(parsed.stratified),
    attempts: Number(parsed.attempts || 1),
    method: String(parsed.method || "sklearn_StratifiedShuffleSplit_groups"),
    versionId: versionRow.id,
    version: versionNumber,
    files: (parsed.files as Record<string, string>) || {},
    classDistribution: (parsed.class_distribution as Record<string, Record<string, number>>) || {},
    groups: {
      total: Number((parsed.groups as Record<string, number>)?.total || 0),
      derived: Number((parsed.groups as Record<string, number>)?.derived_groups || 0),
    },
    logs,
  };
  logs.push(
    `[split] ${result.train}/${result.val}/${result.test} | leakage=${result.leakage} | stratified=${result.stratified} | version=${versionNumber}`
  );
  return result;
}

// ---------------------------------------------------------------------------
// STEP 5 — train VisionBharat V2
// ---------------------------------------------------------------------------

export interface TrainOptions {
  datasetVersionId?: string | null;
  epochs?: number;
  batchSize?: number;
  imgSize?: number;
  learningRate?: number;
  onLine?: (line: string) => void;
  testRun?: boolean;
  timeoutMs?: number;
  limitTrain?: number;
}

export async function runTraining(options: TrainOptions = {}): Promise<TrainingResult> {
  const resolved = await resolveVersion(options.datasetVersionId);
  const classList = await ensureClasses(resolved.datasetId);
  const logs: string[] = [];

  const splitFile = path.join(SPLIT_DIR, "split.json");
  if (!fs.existsSync(splitFile)) {
    return {
      ok: false, epochsRun: 0, bestValMap50: 0, bestEpoch: 0, parameters: 0, durationSeconds: 0,
      checkpointPaths: [], report: null, history: [], logs,
      error: `split file not found (${splitFile}) — run the auto-split step first`,
    };
  }

  const epochs = options.testRun ? 2 : Math.max(1, Math.round(options.epochs ?? 200));
  const args = [
    "--data", splitFile,
    "--epochs", String(epochs),
    "--batch", String(options.batchSize ?? 8),
    "--img", String(options.imgSize ?? 640),
    "--workers", "2",
    "--num_classes", String(classList.length),
    "--class_names", classList.join(","),
    "--learning_rate", String(options.learningRate ?? 1e-3),
    "--optimizer", "adamw",
    "--checkpoint_dir", CHECKPOINTS_DIR,
    "--models_dir", MODELS_DIR,
    "--report_path", path.join(MODELS_DIR, "report.json"),
  ];
  if (options.testRun) {
    args.push("--test-run");
    if (options.limitTrain) args.push("--limit-train", String(options.limitTrain));
  }

  logs.push(`[train] python ai/train.py ${args.join(" ")}`);
  const started = Date.now();
  const run = await runPython("train.py", args, {
    onLine: (line) => {
      logs.push(line);
      options.onLine?.(line);
    },
    timeoutMs: options.timeoutMs ?? 6 * 60 * 60 * 1000,
  });

  const report = parsePrefixedJson<Record<string, unknown>>(run.lines, "VBTRAIN_DONE:") ??
    readJson(path.join(MODELS_DIR, "report.json"));

  const checkpointPaths = [path.join(CHECKPOINTS_DIR, "best.pt"), VISIONBHARAT_V2_BEST, path.join(MODELS_DIR, "best.pt")].filter(
    (p) => fs.existsSync(p)
  );

  const history = ((report?.history as Array<Record<string, number>>) || []).map((h) => ({
    epoch: Number(h.epoch),
    train_loss: Number(h.train_loss),
    val_loss: Number(h.val_loss),
    mAP50: Number(h.mAP50),
    precision: Number(h.precision),
    recall: Number(h.recall),
    lr: Number(h.lr),
  }));

  return {
    ok: run.ok && checkpointPaths.length > 0,
    epochsRun: history.length,
    bestValMap50: Number(report?.best_val_mAP50 ?? (history.length ? Math.max(...history.map((h) => h.mAP50)) : 0)),
    bestEpoch: Number(report?.best_epoch ?? 0),
    parameters: Number(report?.parameters ?? 0),
    durationSeconds: Number(report?.duration_seconds ?? Math.round((Date.now() - started) / 1000)),
    checkpointPaths,
    report,
    history,
    logs: logs.slice(-200),
    error: run.ok ? undefined : run.error,
  };
}

// ---------------------------------------------------------------------------
// STEP 6 — real evaluation
// ---------------------------------------------------------------------------

export interface EvaluateOptions {
  datasetVersionId?: string | null;
  modelPath?: string;
  confidence?: number;
  iou?: number;
  onLine?: (line: string) => void;
}

export async function runEvaluation(options: EvaluateOptions = {}): Promise<EvaluationResult> {
  const resolved = await resolveVersion(options.datasetVersionId);
  const classList = await ensureClasses(resolved.datasetId);
  const logs: string[] = [];

  const modelPath = options.modelPath || (fs.existsSync(BEST_PT) ? BEST_PT : VISIONBHARAT_V2_BEST);
  let testData = path.join(SPLIT_DIR, "test_split.json");
  if (!fs.existsSync(testData)) {
    const fallback = path.join(SPLIT_DIR, "split.json");
    if (fs.existsSync(fallback)) testData = fallback;
  }

  const empty: EvaluationResult = {
    ok: false, precision: 0, recall: 0, f1: 0, accuracy: 0, map50: 0, map5095: 0, meanIou: 0,
    perClass: {}, confusionMatrix: [], errorAnalysis: {}, latencyMs: {}, images: 0, raw: null, logs,
  };

  if (!fs.existsSync(modelPath)) {
    return { ...empty, error: `checkpoint not found: ${modelPath} — train the model first` };
  }
  if (!fs.existsSync(testData)) {
    return { ...empty, error: `test split not found: ${testData} — run the auto-split step first` };
  }

  const output = path.join(CHECKPOINTS_DIR, "evaluation_results.json");
  const run = await runPython(
    "evaluate.py",
    [
      "--model", modelPath,
      "--test_data", testData,
      "--num_classes", String(classList.length),
      "--class_names", classList.join(","),
      "--conf", String(options.confidence ?? 0.25),
      "--iou", String(options.iou ?? 0.5),
      "--output", output,
    ],
    { onLine: (line) => { logs.push(line); options.onLine?.(line); }, timeoutMs: 30 * 60 * 1000 }
  );

  const parsed = parsePrefixedJson<Record<string, unknown>>(run.lines, "VBEVAL_RESULT:");
  const metrics = parsed && parsed.status === "ok" ? parsed : null;
  if (!metrics) {
    return { ...empty, logs, error: (parsed?.error as string) || run.error || "evaluation failed" };
  }

  const confusion = (metrics.confusion_matrix as number[][]) || [];
  const errorAnalysis = (metrics.error_analysis as Record<string, unknown>) || {};
  const perClass = (metrics.per_class as Record<string, Record<string, number>>) || {};

  // Persist to the evaluations table so the UI/report pages read real numbers.
  try {
    const totals = (metrics.totals as Record<string, number>) || {};
    const errors = (errorAnalysis.counts as Record<string, number>) || {};
    const modelRows = await db
      .select({ id: models.id })
      .from(models)
      .where(eq(models.datasetId, resolved.datasetId))
      .orderBy(desc(models.createdAt))
      .limit(1);
    const modelRow = modelRows[0] ?? null;

    await db.insert(evaluations).values({
      modelId: modelRow?.id ?? null,
      datasetId: resolved.datasetId,
      evalType: "test_set",
      iouThreshold: options.iou ?? 0.5,
      confidenceThreshold: options.confidence ?? 0.25,
      totalImages: Number(totals.images ?? 0),
      totalGroundTruth: Number(totals.ground_truths ?? 0),
      totalDetections: Number(totals.predictions ?? 0),
      truePositives: Number(totals.true_positives ?? 0),
      falsePositives: Number(totals.false_positives ?? 0),
      falseNegatives: Number(totals.false_negatives ?? 0),
      precision: Number(metrics.precision ?? 0),
      recall: Number(metrics.recall ?? 0),
      f1: Number(metrics.f1 ?? 0),
      meanIou: Number(metrics.mean_iou ?? 0),
      mapScore: Number(metrics.map50 ?? 0),
      perClassMetrics: { perClass, map5095: metrics.map5095, accuracy: metrics.accuracy, latency: metrics.latency_ms },
      confusionMatrix: { matrix: confusion, labels: metrics.confusion_matrix_labels },
      errorAnalysis: { ...errorAnalysis, map50_per_iou: metrics.map50_per_iou, errors },
      isTestSetUsed: true,
      isDemo: false,
    });

    if (modelRow?.id) {
      await db
        .update(models)
        .set({
          precision: Number(metrics.precision ?? 0),
          recall: Number(metrics.recall ?? 0),
          f1: Number(metrics.f1 ?? 0),
          iou: Number(metrics.mean_iou ?? 0),
          mapScore: Number(metrics.map50 ?? 0),
          status: "evaluated",
          updatedAt: new Date(),
        })
        .where(eq(models.id, modelRow.id));
    }
  } catch (error) {
    logs.push(`[evaluate] warning: could not persist metrics (${error instanceof Error ? error.message : String(error)})`);
  }

  return {
    ok: true,
    precision: Number(metrics.precision ?? 0),
    recall: Number(metrics.recall ?? 0),
    f1: Number(metrics.f1 ?? 0),
    accuracy: Number(metrics.accuracy ?? 0),
    map50: Number(metrics.map50 ?? 0),
    map5095: Number(metrics.map5095 ?? 0),
    meanIou: Number(metrics.mean_iou ?? 0),
    perClass,
    confusionMatrix: confusion,
    errorAnalysis,
    latencyMs: (metrics.latency_ms as Record<string, number>) || {},
    images: Number((metrics.totals as Record<string, number>)?.images ?? 0),
    raw: metrics,
    outputPath: output,
    logs,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function readJson(file: string): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
}

export interface ModelArtifacts {
  bestPt: boolean;
  bestPtSizeMb: number;
  visionbharatV2: boolean;
  visionbharatV2SizeMb: number;
  modelsBest: boolean;
  evaluationResults: boolean;
  ready: boolean;
}

export function modelArtifacts(): ModelArtifacts {
  const sizeOf = (p: string) => {
    try {
      return fs.existsSync(p) ? Math.round((fs.statSync(p).size / (1024 * 1024)) * 10) / 10 : 0;
    } catch {
      return 0;
    }
  };
  const bestPt = fs.existsSync(BEST_PT);
  const v2 = fs.existsSync(VISIONBHARAT_V2_BEST);
  const modelsBest = fs.existsSync(path.join(MODELS_DIR, "best.pt"));
  const evalJson = fs.existsSync(path.join(CHECKPOINTS_DIR, "evaluation_results.json"));
  return {
    bestPt,
    bestPtSizeMb: sizeOf(BEST_PT),
    visionbharatV2: v2,
    visionbharatV2SizeMb: sizeOf(VISIONBHARAT_V2_BEST),
    modelsBest,
    evaluationResults: evalJson,
    ready: bestPt && v2 && modelsBest && evalJson,
  };
}

export { INFERENCE_OUTPUT_DIR, AUGMENTED_DIR, CAPTURED_PHOTOS_DIR, DEFAULT_CLASSES };
