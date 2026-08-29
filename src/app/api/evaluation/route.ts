import { NextRequest } from "next/server";
import { db } from "@/db";
import { evaluations, models, images } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { resolveDatasetIdentifier } from "@/lib/dataset";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const modelId = url.searchParams.get("modelId");
    const datasetIdParam = url.searchParams.get("datasetId");

    let query = db.select().from(evaluations);
    if (modelId) {
      query = query.where(eq(evaluations.modelId, modelId)) as typeof query;
    } else if (datasetIdParam) {
      const ds = await resolveDatasetIdentifier(datasetIdParam);
      if (ds) {
        query = query.where(eq(evaluations.datasetId, ds.id)) as typeof query;
      }
    }

    const result = await query.orderBy(desc(evaluations.createdAt)).limit(100);
    return Response.json({ evaluations: result, total: result.length });
  } catch (error) {
    console.error("[EVALUATION] GET Error:", error);
    return Response.json({ error: "Failed to fetch evaluations" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      modelId, experimentId, datasetId, evalType = "validation",
      iouThreshold = 0.5, confidenceThreshold = 0.5,
    } = body;

    if (!modelId) {
      return Response.json({ error: "modelId required" }, { status: 400 });
    }

    const model = await db.select().from(models).where(eq(models.id, modelId)).limit(1);
    if (model.length === 0) {
      return Response.json({ error: "Model not found" }, { status: 404 });
    }

    let totalImages = 0;
    let resolvedDatasetId = datasetId;
    if (datasetId) {
      const ds = await resolveDatasetIdentifier(datasetId);
      if (ds) resolvedDatasetId = ds.id;
      const countResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(images)
        .where(eq(images.datasetId, resolvedDatasetId));
      totalImages = countResult[0].count;
    }

    const inserted = await db.insert(evaluations).values({
      modelId,
      experimentId: experimentId || null,
      datasetId: resolvedDatasetId || null,
      evalType,
      iouThreshold,
      confidenceThreshold,
      totalImages,
      totalGroundTruth: 0,
      totalDetections: 0,
      truePositives: 0,
      falsePositives: 0,
      falseNegatives: 0,
      precision: 0,
      recall: 0,
      f1: 0,
      meanIou: 0,
      perClassMetrics: null,
      confusionMatrix: null,
      errorAnalysis: null,
      isDemo: false,
    }).returning();

    return Response.json({ evaluation: inserted[0] }, { status: 201 });
  } catch (error) {
    console.error("[EVALUATION] POST Error:", error);
    return Response.json({ error: "Failed to create evaluation" }, { status: 500 });
  }
}
