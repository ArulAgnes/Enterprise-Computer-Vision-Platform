/**
 * POST /api/pipeline/run — INVENTION 3: One-Click Autonomous Pipeline
 * ===================================================================
 * 26 captured photos -> scan -> verify annotations -> 100 synthetic samples ->
 * leakage-free split -> VisionBharat V2 training (from scratch) -> real
 * evaluation -> `best.pt` in all three locations -> inference ready.
 *
 * Body:
 *   { source?: "captured_photos", targetAugment?: number, epochs?: number,
 *     stream?: boolean, testRun?: boolean, batchSize?: number, imgSize?: number }
 *
 * `stream: true` answers with Server-Sent Events so the dashboard can render a
 * live terminal; otherwise the final JSON payload is returned.
 */
import fs from "fs";
import path from "path";

import { CHECKPOINTS_DIR, MODELS_DIR, PROJECT_ROOT, SPLIT_DIR, VISIONBHARAT_V2_BEST, BEST_PT, PYTHON_EXECUTABLE, AI_DIR } from "@/lib/paths";
import {
  ANNOTATION_TARGET,
  DEFAULT_AUGMENT_TARGET,
  autoAnnotateImages,
  countAnnotated,
  modelArtifacts,
  readJson,
  runAutoSplit,
  runAugmentation,
  runEvaluation,
  scanCapturedPhotos,
  type StepUpdate,
} from "@/lib/ai-pipeline";
import { getOrCreateDataset, runTraining } from "@/lib/ai-pipeline";


export const dynamic = "force-dynamic";
export const maxDuration = 3600;

const INVENTION_LIST = [
  "Annotation-Aware Synthetic Expansion Engine (10 -> 100, bbox preserved)",
  "Paste-to-Predict universal inference (Ctrl+V anywhere)",
  "One-Click Autonomous Pipeline (10 -> 100 -> split -> train -> best.pt)",
  "Data-First Quality Gate with Leakage-Free Auto Split",
];

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const options = {
    source: String(body.source ?? "captured_photos"),
    targetAugment: Number(body.targetAugment ?? body.target ?? DEFAULT_AUGMENT_TARGET),
    epochs: Number(body.epochs ?? 200),
    batchSize: Number(body.batchSize ?? 8),
    imgSize: Number(body.imgSize ?? 640),
    testRun: Boolean(body.testRun),
    confidence: Number(body.confidence ?? 0.25),
  };
  const stream = Boolean(body.stream);

  if (stream) {
    return streamPipeline({ ...options, autoAnnotate: body.autoAnnotate !== false });
  }

  try {
    const result = await executePipeline({ ...options, autoAnnotate: body.autoAnnotate !== false });
    return Response.json(result, { status: result.status === "completed" ? 200 : 200 });
  } catch (error) {
    console.error("[PIPELINE] Error:", error);
    return Response.json(
      { status: "error", error: error instanceof Error ? error.message : "Pipeline failed" },
      { status: 500 }
    );
  }
}

type PipelineOptions = {
  source: string;
  targetAugment: number;
  epochs: number;
  batchSize: number;
  imgSize: number;
  testRun: boolean;
  confidence: number;
  autoAnnotate?: boolean;
};

async function executePipeline(
  options: PipelineOptions,
  emit?: (update: StepUpdate) => void
): Promise<Record<string, unknown>> {
  const steps: string[] = [];
  const stepState: StepUpdate[] = [];
  const push = (update: StepUpdate) => {
    const existing = stepState.findIndex((s) => s.id === update.id);
    if (existing >= 0) stepState[existing] = update;
    else stepState.push(update);
    emit?.(update);
  };

  // ---------------- STEP 1: scan captured photos ----------------
  push({ id: "scan", label: "Captured Photos Scanned", status: "running", detail: "Scanning capture folders…" });
  const ds = await getOrCreateDataset();
  const scan = await scanCapturedPhotos(ds.id, options.source === "captured_photos" ? undefined : options.source);
  steps.push(`Scanned ${scan.scanned} captured photos (${scan.inserted} new)`);
  push({
    id: "scan",
    label: "Captured Photos Scanned",
    status: "done",
    detail: `${scan.scanned} photos · ${Object.keys(scan.perFolder).length} folders · ${scan.inserted} new`,
    data: { scanned: scan.scanned, inserted: scan.inserted, perFolder: scan.perFolder },
  });

  // ---------------- STEP 2: annotations (with classical-CV proposal fill) ----------------
  push({ id: "annotations", label: "Annotations Verified", status: "running", detail: "Counting annotated images…" });
  let counts = await countAnnotated(ds.id);
  let autoAnnotation: Awaited<ReturnType<typeof autoAnnotateImages>> | null = null;

  // Data-first behaviour: when fewer than 10 images are annotated, propose boxes
  // with the classical CV accelerator (Lab saliency + Otsu — no pretrained model)
  // so the autonomous run never blocks. The boxes stay human-editable.
  if (counts.annotated < ANNOTATION_TARGET && options.autoAnnotate !== false) {
    push({
      id: "annotations",
      label: "Annotations Verified",
      status: "running",
      detail: `Only ${counts.annotated}/${ANNOTATION_TARGET} annotated — running the CV proposal accelerator…`,
    });
    autoAnnotation = await autoAnnotateImages(ds.id, {
      perClass: Math.ceil(ANNOTATION_TARGET / 2),
      onLine: (line) => emit?.({ id: "annotations", label: "Annotations Verified", status: "running", detail: line.slice(0, 180) }),
    });
    if (!autoAnnotation.ok) {
      emit?.({
        id: "annotations",
        label: "Annotations Verified",
        status: "waiting",
        detail: `CV accelerator could not propose boxes: ${autoAnnotation.error ?? "no proposals"}`,
      });
    }
    counts = await countAnnotated(ds.id);
  }

  if (counts.annotated < ANNOTATION_TARGET) {
    push({
      id: "annotations",
      label: "Annotations Verified",
      status: "waiting",
      detail: `${counts.annotated}/${ANNOTATION_TARGET} annotated — open the Annotation Studio`,
      data: { annotated: counts.annotated, required: ANNOTATION_TARGET },
    });
    return {
      status: "need_annotation",
      annotated: counts.annotated,
      required: ANNOTATION_TARGET,
      dataset_id: ds.id,
      message: `Annotate ${ANNOTATION_TARGET - counts.annotated} more image(s) in /annotation, then press Run Pipeline again.`,
      steps: stepState,
      invention: INVENTION_LIST,
    };
  }
  steps.push(
    `Annotated ${counts.annotated} images verified` +
      (autoAnnotation ? ` (${autoAnnotation.inserted} boxes proposed by the classical-CV accelerator, human-editable)` : "")
  );
  push({
    id: "annotations",
    label: "Annotations Verified",
    status: "done",
    detail:
      `${counts.annotated} annotated / ${counts.total} images` +
      (autoAnnotation ? ` · ${autoAnnotation.inserted} auto-proposed (editable)` : ""),
    data: {
      annotated: counts.annotated,
      total: counts.total,
      auto_proposed: autoAnnotation?.inserted ?? 0,
      proposals: autoAnnotation?.proposals?.slice(0, 6) ?? [],
      engine: autoAnnotation?.engine,
    },
  });

  // ---------------- STEP 3: synthetic expansion (INVENTION 1) ----------------
  push({
    id: "augment",
    label: `Smart Augmentation (${counts.annotated} -> ${options.targetAugment})`,
    status: "running",
    detail: "Running the Annotation-Aware Synthetic Expansion Engine…",
  });
  const augmentation = await runAugmentation({
    datasetVersionId: ds.id,
    targetCount: options.targetAugment,
    onLine: (line) => {
      if (line.includes("[Augment]")) {
        emit?.({ id: "augment", label: "Smart Augmentation", status: "running", detail: line.slice(0, 180) });
      }
    },
  });
  if (augmentation.status !== "ready") {
    push({ id: "augment", label: "Smart Augmentation", status: "error", detail: augmentation.error || "failed" });
    return {
      status: "error",
      error: augmentation.error || "Synthetic expansion failed",
      steps: stepState,
      logs: augmentation.logs.slice(-80),
      invention: INVENTION_LIST,
    };
  }
  steps.push(`Augmented ${counts.annotated} -> ${augmentation.generated} bbox-preserving samples`);
  push({
    id: "augment",
    label: `Smart Augmentation (${counts.annotated} -> ${counts.annotated + augmentation.generated})`,
    status: "done",
    detail: `${augmentation.generated} synthetic samples · ${augmentation.engine} · ${augmentation.rejected} rejected by the quality gate`,
    data: {
      generated: augmentation.generated,
      preview: augmentation.preview,
      per_class: augmentation.per_class,
      images: augmentation.images.slice(0, 3),
    },
  });

  // ---------------- STEP 4: leakage-free split (INVENTION 4) ----------------
  push({ id: "split", label: "Auto Split (Leakage-Free)", status: "running", detail: "Stratified 70/15/15 with hash guards…" });
  const split = await runAutoSplit({ datasetVersionId: ds.id, seed: 42 });
  if (split.status !== "ok") {
    push({ id: "split", label: "Auto Split", status: "error", detail: split.error || "failed" });
    return { status: "error", error: split.error || "Split failed", steps: stepState, invention: INVENTION_LIST };
  }
  steps.push(`Split ${split.train}/${split.val}/${split.test} — leakage ${split.leakage}`);
  push({
    id: "split",
    label: `Auto Split (${split.train}/${split.val}/${split.test})`,
    status: "done",
    detail: `Leakage: ${split.leakage} · stratified: ${split.stratified ? "yes" : "no"} · groups: ${split.groups.total}`,
    data: {
      train: split.train,
      val: split.val,
      test: split.test,
      leakage: split.leakage,
      version_id: split.versionId,
      class_distribution: split.classDistribution,
    },
  });

  // ---------------- STEP 5: training (INVENTION 4.2 — V2 model) ----------------
  push({ id: "train", label: `Training V2 (${options.testRun ? 2 : options.epochs} epochs)`, status: "running", detail: "Compiling graph…" });
  const training = await runTraining({
    datasetVersionId: ds.id,
    epochs: options.epochs,
    batchSize: options.batchSize,
    imgSize: options.imgSize,
    testRun: options.testRun,
    onLine: (line) => {
      if (line.startsWith("VBEPOCH:")) {
        try {
          const record = JSON.parse(line.slice("VBEPOCH:".length));
          emit?.({
            id: "train",
            label: `Training V2 (epoch ${record.epoch}/${options.testRun ? 2 : options.epochs})`,
            status: "running",
            detail: `loss ${record.train_loss} · mAP@0.5 ${record.mAP50} · lr ${record.lr}`,
            data: record,
          });
        } catch {
          /* ignore malformed epoch line */
        }
      } else if (line.includes("[Trainer]") || line.includes("[Epoch")) {
        emit?.({ id: "train", label: "Training V2", status: "running", detail: line.slice(0, 200) });
      }
    },
  });

  if (!training.ok) {
    push({ id: "train", label: "Training V2", status: "error", detail: training.error || "training failed" });
    return {
      status: "error",
      error: training.error || "Training failed",
      steps: stepState,
      logs: training.logs.slice(-80),
      invention: INVENTION_LIST,
    };
  }
  steps.push(`Trained ${training.epochsRun} epochs — best val mAP@0.5 ${training.bestValMap50.toFixed(4)}`);
  push({
    id: "train",
    label: `Training V2 (${training.epochsRun} epochs)`,
    status: "done",
    detail: `${training.parameters.toLocaleString()} params · best val mAP@0.5 ${training.bestValMap50.toFixed(4)} · ${Math.round(training.durationSeconds)}s`,
    data: { best_epoch: training.bestEpoch, checkpoints: training.checkpointPaths, history: training.history.slice(-20) },
  });

  // ---------------- STEP 6: evaluation ----------------
  push({ id: "evaluate", label: "Evaluation (real metrics)", status: "running", detail: "Scoring the held-out test split…" });
  const evaluation = await runEvaluation({ datasetVersionId: ds.id, confidence: options.confidence });
  if (!evaluation.ok) {
    push({ id: "evaluate", label: "Evaluation", status: "error", detail: evaluation.error || "failed" });
  } else {
    steps.push(
      `Evaluated: mAP@0.5 ${evaluation.map50.toFixed(3)} · precision ${evaluation.precision.toFixed(3)} · recall ${evaluation.recall.toFixed(3)}`
    );
    push({
      id: "evaluate",
      label: `Evaluation (mAP@0.5 ${evaluation.map50.toFixed(3)})`,
      status: "done",
      detail: `precision ${evaluation.precision.toFixed(3)} · recall ${evaluation.recall.toFixed(3)} · mAP@0.5:0.95 ${evaluation.map5095.toFixed(3)} · meanIoU ${evaluation.meanIou.toFixed(3)}`,
      data: {
        precision: evaluation.precision,
        recall: evaluation.recall,
        map50: evaluation.map50,
        map5095: evaluation.map5095,
        per_class: evaluation.perClass,
        confusion_matrix: evaluation.confusionMatrix,
      },
    });
  }

  // ---------------- STEP 7: artefacts ----------------
  push({ id: "artifacts", label: "best.pt Ready", status: "running", detail: "Verifying artefacts…" });
  const artifacts = modelArtifacts();
  push({
    id: "artifacts",
    label: artifacts.ready ? "best.pt Ready + Inference Ready" : "best.pt Ready (partial)",
    status: artifacts.ready ? "done" : "waiting",
    detail: `ai/checkpoints/best.pt ${artifacts.bestPtSizeMb}MB · models/visionbharat_v2_best.pt ${artifacts.visionbharatV2SizeMb}MB`,
    data: artifacts as unknown as Record<string, unknown>,
  });
  steps.push("best.pt mirrored to ai/checkpoints, models/visionbharat_v2_best.pt and models/best.pt");

  return {
    status: "completed",
    model_path: path.join(CHECKPOINTS_DIR, "best.pt"),
    models_path: VISIONBHARAT_V2_BEST,
    model_paths: { best_pt: BEST_PT, visionbharat_v2_best: VISIONBHARAT_V2_BEST, models_best: path.join(MODELS_DIR, "best.pt") },
    metrics: evaluation.ok
      ? {
          mAP50: evaluation.map50,
          mAP5095: evaluation.map5095,
          precision: evaluation.precision,
          recall: evaluation.recall,
          accuracy: evaluation.accuracy,
          f1: evaluation.f1,
          mean_iou: evaluation.meanIou,
          per_class: evaluation.perClass,
        }
      : null,
    training: {
      epochs_run: training.epochsRun,
      best_epoch: training.bestEpoch,
      best_val_mAP50: training.bestValMap50,
      parameters: training.parameters,
      duration_seconds: training.durationSeconds,
      history: training.history,
    },
    augmentation: {
      original: augmentation.original,
      generated: augmentation.generated,
      target: augmentation.requested,
      engine: augmentation.engine,
      rejected: augmentation.rejected,
      duplicates: augmentation.duplicates,
      preview: augmentation.preview,
      per_class: augmentation.per_class,
    },
    split: {
      train: split.train,
      val: split.val,
      test: split.test,
      leakage: split.leakage,
      stratified: split.stratified,
      method: split.method,
      version: split.version,
      class_distribution: split.classDistribution,
    },
    steps,
    step_state: stepState,
    artifacts,
    inference_ready: artifacts.ready,
    invention: INVENTION_LIST,
    report: training.report,
  };
}

/** Server-Sent Events flavour of the pipeline for the live dashboard. */
function streamPipeline(options: PipelineOptions): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      send("start", { started_at: new Date().toISOString(), options });
      try {
        const result = await executePipeline(options, (update) => send("step", update));
        send("result", result);
      } catch (error) {
        send("error", { error: error instanceof Error ? error.message : "Pipeline failed" });
      } finally {
        send("done", { finished_at: new Date().toISOString() });
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

/** GET /api/pipeline/run — current readiness snapshot for the hero card. */
export async function GET(request: Request) {
  // EventSource can only issue GET requests, so the hero button streams through
  // this branch: /api/pipeline/run?stream=true&targetAugment=100&epochs=200…
  const url = new URL(request.url);
  if (url.searchParams.get("stream") === "true") {
    return streamPipeline({
      source: String(url.searchParams.get("source") ?? "captured_photos"),
      targetAugment: Number(url.searchParams.get("targetAugment") ?? DEFAULT_AUGMENT_TARGET),
      epochs: Number(url.searchParams.get("epochs") ?? 200),
      batchSize: Number(url.searchParams.get("batchSize") ?? 8),
      imgSize: Number(url.searchParams.get("imgSize") ?? 640),
      testRun: url.searchParams.get("testRun") === "true",
      confidence: Number(url.searchParams.get("confidence") ?? 0.25),
      autoAnnotate: url.searchParams.get("autoAnnotate") !== "false",
    });
  }

  try {
    const { resolveVersion } = await import("@/lib/ai-pipeline");
    const { datasetId } = await resolveVersion(null);
    const counts = await countAnnotated(datasetId);
    const artifacts = modelArtifacts();
    const report = readJson(path.join(MODELS_DIR, "report.json"));
    const evaluation = readJson(path.join(CHECKPOINTS_DIR, "evaluation_results.json"));

    let capturedPhotos = 0;
    for (const folder of ["bell", "oillamp"]) {
      const dir = path.join(PROJECT_ROOT, "captured_photos", folder);
      if (fs.existsSync(dir)) capturedPhotos += fs.readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).length;
    }

    return Response.json({
      dataset_id: datasetId,
      captured_photos: capturedPhotos,
      annotated: counts.annotated,
      total_images: counts.total,
      required_annotations: ANNOTATION_TARGET,
      ready_to_run: counts.annotated >= ANNOTATION_TARGET,
      split_available: fs.existsSync(path.join(SPLIT_DIR, "split.json")),
      artifacts,
      last_training: report ? { best_val_mAP50: report.best_val_mAP50, epochs_run: report.epochs_run, params: report.parameters } : null,
      last_evaluation: evaluation ? { map50: evaluation.map50, precision: evaluation.precision, recall: evaluation.recall } : null,
      python: PYTHON_EXECUTABLE,
      ai_dir: AI_DIR,
      invention: INVENTION_LIST,
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "failed" }, { status: 500 });
  }
}
