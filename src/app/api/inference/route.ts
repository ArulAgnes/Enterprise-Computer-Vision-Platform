/**
 * /api/inference — dataset-image inference (compatibility route)
 * =============================================================
 * POST body: { imageId, modelId?, confidenceThreshold?, base64?, source? }
 *
 * Kept as the stable API used by the dataset/model pages: it forwards to the
 * same universal engine as /api/infer, but starts from an `imageId` in the DB.
 * Class handling is fully dynamic (never `person`, never `num_classes 1`).
 */
import { NextRequest } from "next/server";

import { db } from "@/db";
import { images, models } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { latestInferenceStats, resolveCheckpoint, runInference } from "@/lib/inference";
import { ensureClasses, getOrCreateDataset, modelArtifacts } from "@/lib/ai-pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { imageId, modelId, imagePath, base64, confidenceThreshold = 0.25 } = body;

    let resolvedImagePath: string | null = imagePath ?? null;
    let imageRecord = null;

    if (imageId) {
      const rows = await db.select().from(images).where(eq(images.id, imageId)).limit(1);
      if (rows.length > 0) {
        imageRecord = rows[0];
        resolvedImagePath = rows[0].filepath || resolvedImagePath;
      }
    }

    if (!resolvedImagePath && !base64) {
      return Response.json({ error: "imageId, imagePath or base64 required" }, { status: 400 });
    }

    let checkpoint: string | null = null;
    if (modelId) {
      const rows = await db.select().from(models).where(eq(models.id, modelId)).limit(1);
      checkpoint = rows[0]?.checkpointPath ?? null;
      if (rows.length === 0) {
        return Response.json({ error: "Model not found" }, { status: 404 });
      }
    }
    if (!checkpoint) checkpoint = await resolveCheckpoint(null);

    if (!checkpoint) {
      return Response.json(
        {
          error: "NO TRAINED CHECKPOINT",
          message: "Train the model first — the one-click pipeline generates ai/checkpoints/best.pt.",
          status: "blocked",
        },
        { status: 400 }
      );
    }

    const dataset = await getOrCreateDataset();
    const classList = await ensureClasses(dataset.id);
    const result = await runInference({
      imagePath: resolvedImagePath,
      base64,
      confidence: Number(confidenceThreshold),
      modelPath: checkpoint,
    });

    if (!result.ok) {
      return Response.json({ error: result.error || "Inference failed", logs: result.logs.slice(-20) }, { status: 500 });
    }

    const latestModel = await db.select().from(models).orderBy(desc(models.createdAt)).limit(1);

    return Response.json({
      success: true,
      inference: {
        id: undefined,
        detections: result.predictions,
        predictions: result.predictions,
        numDetections: result.predictions.length,
        inferenceTimeMs: result.timeMs,
        imageWidth: result.imageWidth,
        imageHeight: result.imageHeight,
        annotated_image_url: result.annotatedImageUrl,
      },
      model: {
        id: latestModel[0]?.id ?? null,
        name: latestModel[0]?.name ?? "VisionBharat V2",
        checkpointPath: checkpoint,
        numClasses: classList.length,
        classNames: classList,
      },
      image: imageRecord ? { id: imageRecord.id, filename: imageRecord.filename } : null,
      artifacts: modelArtifacts(),
    });
  } catch (error) {
    console.error("[INFERENCE] Error:", error);
    return Response.json({ error: error instanceof Error ? error.message : "Inference failed" }, { status: 500 });
  }
}

export async function GET() {
  const checkpoint = await resolveCheckpoint(null);
  const dataset = await getOrCreateDataset();
  const classList = await ensureClasses(dataset.id);
  return Response.json({
    ready: !!checkpoint,
    checkpoint,
    classes: classList,
    numClasses: classList.length,
    stats: await latestInferenceStats(),
  });
}
