import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { experiments } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

/**
 * GET /api/experiments - List all experiments
 * POST /api/experiments - Create a new experiment
 */
export async function GET() {
  try {
    const allExperiments = await db.select().from(experiments).orderBy(desc(experiments.createdAt));
    return NextResponse.json(allExperiments);
  } catch (error) {
    console.error("[EXPERIMENT] Error listing experiments:", error);
    return NextResponse.json({ error: "Failed to list experiments" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      experimentId, name, description, datasetId, datasetVersion,
      imageSize, batchSize, epochs, learningRate, optimizer, weightDecay,
      iouThreshold, confidenceThreshold, randomSeed, augmentationConfig, hardware
    } = body;

    if (!experimentId) {
      return NextResponse.json(
        { success: false, error: "experimentId is required" },
        { status: 400 }
      );
    }

    const [newExperiment] = await db.insert(experiments).values({
      experimentId,
      name: name || `Experiment ${experimentId}`,
      description: description || null,
      datasetId: datasetId || null,
      datasetVersion: datasetVersion || null,
      imageSize: imageSize || 640,
      batchSize: batchSize || 16,
      epochs: epochs || 100,
      learningRate: learningRate || 0.001,
      optimizer: optimizer || "adam",
      weightDecay: weightDecay || 0.0005,
      iouThreshold: iouThreshold || 0.5,
      confidenceThreshold: confidenceThreshold || 0.5,
      randomSeed: randomSeed || 42,
      augmentationConfig: augmentationConfig || null,
      hardware: hardware || "CPU",
      status: "created",
    }).returning();

    return NextResponse.json(newExperiment, { status: 201 });
  } catch (error) {
    console.error("[EXPERIMENT] Error creating experiment:", error);
    return NextResponse.json({ success: false, error: "Failed to create experiment" }, { status: 500 });
  }
}
