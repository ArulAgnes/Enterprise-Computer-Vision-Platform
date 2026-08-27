import { NextRequest } from "next/server";
import { db } from "@/db";
import { models, experiments, datasets } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const modelId = url.searchParams.get("modelId");

    if (modelId) {
      const model = await db.select().from(models).where(eq(models.id, modelId)).limit(1);
      if (model.length === 0) {
        return Response.json({ error: "Model not found" }, { status: 404 });
      }
      return Response.json({ model: model[0] });
    }

    const allModels = await db.select().from(models).orderBy(desc(models.createdAt));
    return Response.json({ models: allModels, total: allModels.length });
  } catch (error) {
    console.error("[MODELS] GET Error:", error);
    return Response.json({ error: "Failed to fetch models" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name, experimentId, datasetId, numClasses, classNames,
      architecture, parameterCount, imageSize = 640, checkpointPath,
    } = body;

    if (!name) {
      return Response.json({ error: "Model name required" }, { status: 400 });
    }

    const modelId = `MODEL-${Date.now()}`;

    const inserted = await db.insert(models).values({
      modelId,
      name,
      architecture: architecture || "VisionBharatDetector-Custom",
      datasetId: datasetId || null,
      experimentId: experimentId || null,
      parameterCount: parameterCount || null,
      imageSize,
      numClasses: numClasses || 8,
      classNames: classNames || null,
      status: "registered",
      isFromScratch: true,
      usesPretrained: false,
      checkpointPath: checkpointPath || null,
    }).returning();

    return Response.json({ model: inserted[0] }, { status: 201 });
  } catch (error) {
    console.error("[MODELS] POST Error:", error);
    return Response.json({ error: "Failed to register model" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updateFields } = body;

    if (!id) {
      return Response.json({ error: "Model ID required" }, { status: 400 });
    }

    const allowed = [
      "name", "status", "precision", "recall", "f1", "iou", "mapScore",
      "checkpointPath", "bestCheckpointPath", "inferenceTimeMs", "trainingDuration",
      "hardware", "notes",
    ];
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of allowed) {
      if (updateFields[key] !== undefined) {
        updateData[key] = updateFields[key];
      }
    }

    const updated = await db.update(models)
      .set(updateData)
      .where(eq(models.id, id))
      .returning();

    return Response.json({ model: updated[0] });
  } catch (error) {
    console.error("[MODELS] PUT Error:", error);
    return Response.json({ error: "Failed to update model" }, { status: 500 });
  }
}
