/**
 * POST /api/evaluate — real evaluation (no zero-metric stubs)
 * ===========================================================
 * Body: { modelId?, datasetVersionId?, modelPath?, confidence?, iou? }
 *
 * Runs `ai/evaluate.py` over the held-out test split and returns genuine
 * precision / recall / F1 / mAP@0.5 / mAP@0.5:0.95 / mean IoU / per-class AP /
 * confusion matrix / error breakdown, persisting everything to the
 * `evaluations` table (and to ai/checkpoints/evaluation_results.json).
 */
import { NextRequest } from "next/server";
import fs from "fs";

import { db } from "@/db";
import { evaluations, models } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { BEST_PT, VISIONBHARAT_V2_BEST } from "@/lib/paths";
import { modelArtifacts, readJson, resolveVersion, runEvaluation } from "@/lib/ai-pipeline";
import { CHECKPOINTS_DIR } from "@/lib/paths";
import path from "path";

export const dynamic = "force-dynamic";
export const maxDuration = 1800;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { datasetVersionId, modelId, modelPath, confidence, iou } = body;

    const { datasetId } = await resolveVersion(datasetVersionId ?? body.datasetId ?? null);

    // Resolve which checkpoint to score.
    let checkpoint = modelPath as string | undefined;
    let modelRowId: string | null = null;
    if (!checkpoint && modelId) {
      const rows = await db.select().from(models).where(eq(models.id, modelId)).limit(1);
      checkpoint = rows[0]?.checkpointPath || undefined;
      modelRowId = rows[0]?.id ?? null;
    }
    if (!checkpoint) {
      const rows = await db.select().from(models).where(eq(models.datasetId, datasetId)).orderBy(desc(models.createdAt)).limit(1);
      checkpoint = rows[0]?.checkpointPath || (fs.existsSync(BEST_PT) ? BEST_PT : VISIONBHARAT_V2_BEST);
      modelRowId = rows[0]?.id ?? null;
    }

    const evaluation = await runEvaluation({
      datasetVersionId: datasetId,
      modelPath: checkpoint,
      confidence: Number(confidence ?? 0.25),
      iou: Number(iou ?? 0.5),
    });

    if (!evaluation.ok) {
      return Response.json(
        {
          error: evaluation.error || "Evaluation failed",
          hint: "Train the model first (/api/pipeline/run) and make sure dataset/test_split.json exists.",
          metrics: null,
          logs: evaluation.logs.slice(-40),
        },
        { status: 400 }
      );
    }

    return Response.json({
      success: true,
      status: "completed",
      modelId: modelRowId,
      datasetId,
      checkpoint,
      metrics: {
        precision: evaluation.precision,
        recall: evaluation.recall,
        f1: evaluation.f1,
        accuracy: evaluation.accuracy,
        map50: evaluation.map50,
        map5095: evaluation.map5095,
        meanIou: evaluation.meanIou,
        images: evaluation.images,
        perClass: evaluation.perClass,
        confusionMatrix: evaluation.confusionMatrix,
        errorAnalysis: evaluation.errorAnalysis,
        latency: evaluation.latencyMs,
      },
      evaluation: {
        id: undefined,
        status: "completed",
        outputPath: evaluation.outputPath,
        resultsFile: path.join(CHECKPOINTS_DIR, "evaluation_results.json"),
      },
      artifacts: modelArtifacts(),
      logs: evaluation.logs.slice(-40),
    });
  } catch (error) {
    console.error("[EVALUATE] Error:", error);
    return Response.json({ error: error instanceof Error ? error.message : "Evaluation failed" }, { status: 500 });
  }
}

/** GET /api/evaluate — latest persisted metrics (used by the dashboard cards). */
export async function GET() {
  try {
    const rows = await db.select().from(evaluations).orderBy(desc(evaluations.createdAt)).limit(1);
    const latest = rows[0] ?? null;
    const fileMetrics = readJson(path.join(CHECKPOINTS_DIR, "evaluation_results.json"));
    return Response.json({
      latest,
      fileMetrics,
      perClass: latest?.perClassMetrics ?? fileMetrics?.per_class ?? null,
      confusionMatrix: latest?.confusionMatrix ?? null,
      artifacts: modelArtifacts(),
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "failed" }, { status: 500 });
  }
}
