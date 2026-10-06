/**
 * POST /api/train — VisionBharat V2 training (from scratch, dynamic classes)
 * ==========================================================================
 * Body: { datasetId?, datasetVersionId?, epochs?, batchSize?, imgSize?,
 *         learningRate?, stream?, testRun?, split? }
 *
 * The class list is ALWAYS resolved dynamically (classes table -> annotation
 * class names -> defaults). `person` and `num_classes 1` do not exist anywhere
 * in this codebase any more.
 *
 * `stream: true` streams Server-Sent Events with per-epoch metrics so the
 * training page can render a live terminal + loss curve.
 */
import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";

import { db } from "@/db";
import { experiments, models } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { CHECKPOINTS_DIR, MODELS_DIR, VISIONBHARAT_V2_BEST, BEST_PT } from "@/lib/paths";
import {
  ensureClasses,
  getOrCreateDataset,
  modelArtifacts,
  readJson,
  resolveVersion,
  runTraining,
  type TrainingResult,
} from "@/lib/ai-pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 3600;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const datasetVersionId: string | null = body.datasetVersionId ?? body.datasetId ?? null;
    const epochs = Number(body.epochs ?? 200);
    const batchSize = Number(body.batchSize ?? 8);
    const imgSize = Number(body.imgSize ?? body.imageSize ?? 640);
    const learningRate = Number(body.learningRate ?? 1e-3);
    const testRun = Boolean(body.testRun);
    const stream = Boolean(body.stream);

    const { datasetId } = await resolveVersion(datasetVersionId);
    const classList = await ensureClasses(datasetId);

    if (stream) {
      return streamTraining({ datasetId, epochs, batchSize, imgSize, learningRate, testRun });
    }

    const [experiment] = await db
      .insert(experiments)
      .values({
        experimentId: `EXP-V2-${Date.now()}`,
        name: `VisionBharat V2 training (${classList.length} classes)`,
        datasetId,
        imageSize: imgSize,
        batchSize,
        epochs,
        learningRate,
        optimizer: "adamw",
        weightDecay: 0.05,
        status: "running",
        isDemo: false,
        config: { classes: classList, augmentation: ["mosaic", "mixup", "copypaste"], ema: true, scheduler: "cosine_warm_restarts" },
      })
      .returning();

    const training = await runTraining({ datasetVersionId: datasetId, epochs, batchSize, imgSize, learningRate, testRun });

    await db
      .update(experiments)
      .set({
        status: training.ok ? "completed" : "failed",
        currentEpoch: training.epochsRun,
        bestValScore: training.bestValMap50,
        trainLoss: training.history.at(-1)?.train_loss ?? null,
        valLoss: training.history.at(-1)?.val_loss ?? null,
        precision: training.history.at(-1)?.precision ?? null,
        recall: training.history.at(-1)?.recall ?? null,
        trainingDuration: Math.round(training.durationSeconds),
        hardware: process.env.VISIONBHARAT_HARDWARE || "CPU / CUDA",
        results: { checkpoints: training.checkpointPaths, history: training.history.slice(-50), report: training.report },
        updatedAt: new Date(),
      })
      .where(eq(experiments.id, experiment.id));

    let modelRow = null;
    if (training.ok) {
      const [model] = await db
        .insert(models)
        .values({
          modelId: `MODEL-V2-${Date.now()}`,
          name: "VisionBharat V2 (CSP+SE / FPN+PAN / Decoupled)",
          version: "2.0",
          architecture: "VisionBharatV2 — CSP+SE backbone, FPN+PAN neck, decoupled heads (from scratch)",
          datasetId,
          experimentId: experiment.id,
          parameterCount: training.parameters,
          imageSize: imgSize,
          numClasses: classList.length,
          classNames: classList,
          status: "trained",
          precision: training.history.at(-1)?.precision ?? null,
          recall: training.history.at(-1)?.recall ?? null,
          mapScore: training.bestValMap50,
          checkpointPath: BEST_PT,
          bestCheckpointPath: VISIONBHARAT_V2_BEST,
          isFromScratch: true,
          usesPretrained: false,
          trainingDuration: Math.round(training.durationSeconds),
          hardware: process.env.VISIONBHARAT_HARDWARE || "CPU",
          notes: `Classes (dynamic): ${classList.join(", ")}`,
        })
        .returning();
      modelRow = model;
      await db.update(experiments).set({ modelId: model.id }).where(eq(experiments.id, experiment.id));
    }

    return Response.json(
      {
        success: training.ok,
        experiment: { id: experiment.id, experimentId: experiment.experimentId, status: training.ok ? "completed" : "failed" },
        model: modelRow ? { id: modelRow.id, modelId: modelRow.modelId, name: modelRow.name, parameters: modelRow.parameterCount } : null,
        classes: classList,
        numClasses: classList.length,
        training: {
          epochsRun: training.epochsRun,
          bestValMap50: training.bestValMap50,
          bestEpoch: training.bestEpoch,
          parameters: training.parameters,
          durationSeconds: training.durationSeconds,
          checkpoints: training.checkpointPaths,
          history: training.history,
        },
        artifacts: modelArtifacts(),
        error: training.error,
        logs: training.logs.slice(-40),
      },
      { status: training.ok ? 200 : 500 }
    );
  } catch (error) {
    console.error("[TRAIN] Error:", error);
    return Response.json({ error: error instanceof Error ? error.message : "Training failed" }, { status: 500 });
  }
}

function streamTraining(params: {
  datasetId: string;
  epochs: number;
  batchSize: number;
  imgSize: number;
  learningRate: number;
  testRun: boolean;
}): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));

      send("start", { ...params, started_at: new Date().toISOString() });
      try {
        const result: TrainingResult = await runTraining({
          datasetVersionId: params.datasetId,
          epochs: params.epochs,
          batchSize: params.batchSize,
          imgSize: params.imgSize,
          learningRate: params.learningRate,
          testRun: params.testRun,
          onLine: (line) => {
            if (line.startsWith("VBEPOCH:")) {
              try {
                send("epoch", JSON.parse(line.slice("VBEPOCH:".length)));
              } catch {
                /* ignore */
              }
            } else {
              send("log", { line: line.slice(0, 400) });
            }
          },
        });
        send("result", {
          ok: result.ok,
          epochsRun: result.epochsRun,
          bestValMap50: result.bestValMap50,
          bestEpoch: result.bestEpoch,
          parameters: result.parameters,
          checkpoints: result.checkpointPaths,
          history: result.history,
          artifacts: modelArtifacts(),
          error: result.error,
        });
      } catch (error) {
        send("error", { error: error instanceof Error ? error.message : "Training failed" });
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

/** GET /api/train — training readiness + last report. */
export async function GET(request: Request) {
  // `GET /api/train?stream=true&epochs=200&…` — EventSource-compatible training
  // stream (the browser cannot POST through EventSource).
  const url = new URL(request.url);
  if (url.searchParams.get("stream") === "true") {
    const ds = await getOrCreateDataset();
    return streamTraining({
      datasetId: url.searchParams.get("datasetId") ?? ds.id,
      epochs: Number(url.searchParams.get("epochs") ?? 200),
      batchSize: Number(url.searchParams.get("batchSize") ?? 8),
      imgSize: Number(url.searchParams.get("imgSize") ?? 640),
      learningRate: Number(url.searchParams.get("learningRate") ?? 1e-3),
      testRun: url.searchParams.get("testRun") === "true",
    });
  }

  try {
    const ds = await getOrCreateDataset();
    const classList = await ensureClasses(ds.id);
    const report = readJson(path.join(MODELS_DIR, "report.json"));
    const lastExperiment = await db.select().from(experiments).orderBy(desc(experiments.createdAt)).limit(1);
    return Response.json({
      datasetId: ds.id,
      classes: classList,
      numClasses: classList.length,
      splitAvailable: fs.existsSync(path.join(process.cwd(), "dataset", "split.json")),
      checkpointDir: CHECKPOINTS_DIR,
      artifacts: modelArtifacts(),
      lastReport: report,
      lastExperiment: lastExperiment[0] ?? null,
      pipeline: {
        optimizer: "AdamW (lr 1e-3, weight decay 0.05)",
        scheduler: "CosineAnnealingWarmRestarts (T_0=10, T_mult=2)",
        loss: "Focal (alpha=0.25, gamma=2.0) + CIoU",
        augmentation: "Mosaic + MixUp + CopyPaste + flips",
        ema: "decay 0.9999",
        earlyStopping: "patience 30, min epochs 150",
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "failed" }, { status: 500 });
  }
}
