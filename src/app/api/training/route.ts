import { NextRequest } from "next/server";
import { db } from "@/db";
import { experiments, trainingMetrics, datasets } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const experimentId = url.searchParams.get("experimentId");

    if (experimentId) {
      const experiment = await db
        .select()
        .from(experiments)
        .where(eq(experiments.id, experimentId))
        .limit(1);

      if (experiment.length === 0) {
        return Response.json({ error: "Experiment not found" }, { status: 404 });
      }

      const metrics = await db
        .select()
        .from(trainingMetrics)
        .where(eq(trainingMetrics.experimentId, experimentId))
        .orderBy(trainingMetrics.epoch);

      return Response.json({ experiment: experiment[0], metrics });
    }

    const allExperiments = await db
      .select()
      .from(experiments)
      .orderBy(desc(experiments.createdAt));

    return Response.json({ experiments: allExperiments, total: allExperiments.length });
  } catch (error) {
    console.error("[TRAINING] GET Error:", error);
    return Response.json({ error: "Failed to fetch training data" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      datasetId, name, description, epochs = 100, batchSize = 16,
      learningRate = 0.001, optimizer = "adam", weightDecay = 0.0005,
      imageSize = 640, confidenceThreshold = 0.5, iouThreshold = 0.5,
      seed = 42,
    } = body;

    if (!datasetId) {
      return Response.json({ error: "datasetId required" }, { status: 400 });
    }

    const dataset = await db.select().from(datasets).where(eq(datasets.id, datasetId)).limit(1);
    if (dataset.length === 0) {
      return Response.json({ error: "Dataset not found" }, { status: 404 });
    }

    const experimentId = `EXP-${Date.now()}`;

    const inserted = await db.insert(experiments).values({
      experimentId,
      name: name || `Training ${experimentId}`,
      description: description || "",
      datasetId,
      imageSize,
      batchSize,
      epochs,
      learningRate,
      optimizer,
      weightDecay,
      confidenceThreshold,
      iouThreshold,
      randomSeed: seed,
      status: "created",
      isDemo: false,
    }).returning();

    return Response.json({ experiment: inserted[0] }, { status: 201 });
  } catch (error) {
    console.error("[TRAINING] POST Error:", error);
    return Response.json({ error: "Failed to create experiment" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status, currentEpoch, trainLoss, valLoss, boxLoss, objectnessLoss, classLoss, precision, recall, f1, iou } = body;

    if (!id) {
      return Response.json({ error: "Experiment ID required" }, { status: 400 });
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (status !== undefined) updateData.status = status;
    if (currentEpoch !== undefined) updateData.currentEpoch = currentEpoch;
    if (trainLoss !== undefined) updateData.trainLoss = trainLoss;
    if (valLoss !== undefined) updateData.valLoss = valLoss;
    if (boxLoss !== undefined) updateData.boxLoss = boxLoss;
    if (objectnessLoss !== undefined) updateData.objectnessLoss = objectnessLoss;
    if (classLoss !== undefined) updateData.classLoss = classLoss;
    if (precision !== undefined) updateData.precision = precision;
    if (recall !== undefined) updateData.recall = recall;
    if (f1 !== undefined) updateData.f1 = f1;
    if (iou !== undefined) updateData.iou = iou;

    const updated = await db.update(experiments)
      .set(updateData)
      .where(eq(experiments.id, id))
      .returning();

    if (currentEpoch !== undefined && (trainLoss !== undefined || valLoss !== undefined)) {
      await db.insert(trainingMetrics).values({
        experimentId: id,
        epoch: currentEpoch,
        trainLoss: trainLoss || null,
        valLoss: valLoss || null,
        boxLoss: boxLoss || null,
        objectnessLoss: objectnessLoss || null,
        classLoss: classLoss || null,
        precision: precision || null,
        recall: recall || null,
        f1: f1 || null,
        iou: iou || null,
      });
    }

    return Response.json({ experiment: updated[0] });
  } catch (error) {
    console.error("[TRAINING] PUT Error:", error);
    return Response.json({ error: "Failed to update experiment" }, { status: 500 });
  }
}
