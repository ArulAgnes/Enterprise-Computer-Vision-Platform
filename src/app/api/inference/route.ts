import { NextRequest } from "next/server";
import { db } from "@/db";
import { inferenceRuns, models, images } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { modelId, imageId } = body;

    if (!modelId) {
      return Response.json({ error: "modelId required" }, { status: 400 });
    }

    const model = await db.select().from(models).where(eq(models.id, modelId)).limit(1);
    if (model.length === 0) {
      return Response.json({ error: "Model not found" }, { status: 404 });
    }

    if (!model[0].checkpointPath) {
      return Response.json({
        error: "NO TRAINED CHECKPOINT AVAILABLE",
        model: model[0].name,
        status: "no_checkpoint",
      }, { status: 400 });
    }

    let imageData = null;
    if (imageId) {
      const img = await db.select().from(images).where(eq(images.id, imageId)).limit(1);
      if (img.length > 0) {
        imageData = img[0];
      }
    }

    const detections: Array<{
      className: string;
      confidence: number;
      x: number;
      y: number;
      width: number;
      height: number;
    }> = [];

    const inserted = await db.insert(inferenceRuns).values({
      modelId,
      imageId: imageId || null,
      detections,
      numDetections: 0,
      inferenceTimeMs: 0,
      imageWidth: imageData?.width || null,
      imageHeight: imageData?.height || null,
      modelVersion: model[0].version || "1.0",
      isDemo: false,
    }).returning();

    return Response.json({
      inference: inserted[0],
      message: "Inference recorded. Run Python inference pipeline for actual detections.",
      model: model[0].name,
      hasCheckpoint: true,
    }, { status: 201 });
  } catch (error) {
    console.error("[INFERENCE] POST Error:", error);
    return Response.json({ error: "Inference failed" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const modelId = url.searchParams.get("modelId");

    let query = db.select().from(inferenceRuns);
    if (modelId) {
      query = query.where(eq(inferenceRuns.modelId, modelId)) as typeof query;
    }

    const runs = await query.limit(100);
    return Response.json({ runs, total: runs.length });
  } catch (error) {
    console.error("[INFERENCE] GET Error:", error);
    return Response.json({ error: "Failed to fetch inference runs" }, { status: 500 });
  }
}
