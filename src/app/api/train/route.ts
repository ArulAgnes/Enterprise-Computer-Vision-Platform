import { NextRequest } from "next/server";
import { db } from "@/db";
import { experiments, trainingMetrics, models, datasets, images, annotations, classes } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import { resolveDatasetIdentifier } from "@/lib/dataset";

const CHECKPOINTS_DIR = path.join(process.cwd(), "checkpoints");
const AI_DIR = path.join(process.cwd(), "ai");

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      datasetId: datasetIdRaw,
      experimentId,
      epochs = 5,
      batchSize = 4,
      learningRate = 0.001,
      optimizer = "adam",
      imageSize = 640,
      seed = 42,
    } = body;

    if (!datasetIdRaw) {
      return Response.json({ error: "datasetId required" }, { status: 400 });
    }

    const ds = await resolveDatasetIdentifier(datasetIdRaw);
    if (!ds) {
      return Response.json({ error: "Dataset not found" }, { status: 404 });
    }

    const datasetId = ds.id;

    // Verify dataset has images
    const imageCount = (await db.select({ count: sql<number>`count(*)::int` }).from(images).where(eq(images.datasetId, datasetId)))[0]?.count ?? 0;
    if (imageCount === 0) {
      return Response.json({ error: "No images in dataset" }, { status: 400 });
    }

    // Check annotations
    const annotatedResult = await db.execute(sql`
      SELECT count(*)::int as count FROM images
      WHERE dataset_id = ${datasetId} AND annotation_status = 'annotated'
    `);
    const annotatedCount = ((annotatedResult as unknown as { rows: { count: number }[] }).rows?.[0]?.count ?? 0) as number;

    if (annotatedCount === 0) {
      return Response.json({
        error: "NO ANNOTATIONS AVAILABLE",
        message: "Training requires annotated images. Please annotate images first.",
        status: "blocked",
        totalImages: imageCount,
        annotatedImages: 0,
      }, { status: 400 });
    }

    // Check for label files
    const trainImgDir = path.join(process.cwd(), "uploads", datasetId);
    const trainLblDir = path.join(process.cwd(), "datasets", "labels", "train");

    let hasLabels = false;
    if (fs.existsSync(trainLblDir)) {
      const labelFiles = fs.readdirSync(trainLblDir).filter(f => f.endsWith(".txt") && f !== ".gitkeep");
      hasLabels = labelFiles.length > 0;
    }

    if (!hasLabels && fs.existsSync(trainImgDir)) {
      const files = fs.readdirSync(trainImgDir);
      for (const f of files) {
        if (f.endsWith(".txt")) {
          hasLabels = true;
          break;
        }
      }
    }

    // Create or use provided experiment
    let exp;
    if (experimentId) {
      const existing = await db.select().from(experiments).where(eq(experiments.id, experimentId)).limit(1);
      exp = existing[0] || null;
    }

    if (!exp) {
      const expId = `EXP-${Date.now()}`;
      const [inserted] = await db.insert(experiments).values({
        experimentId: expId,
        name: `Training ${expId}`,
        datasetId,
        imageSize,
        batchSize,
        epochs,
        learningRate,
        optimizer,
        weightDecay: 0.0005,
        randomSeed: seed,
        status: "running",
        isDemo: false,
      }).returning();
      exp = inserted;
    } else {
      await db.update(experiments).set({ status: "running", updatedAt: new Date() }).where(eq(experiments.id, exp.id));
    }

    // Run Python training
    let trainingResult: Record<string, unknown> = {};
    let trainingSuccess = false;
    let errorMessage = "";

    try {
      const trainScript = path.join(AI_DIR, "train.py");
      const cmd = [
        "python", trainScript,
        "--dataset_root", path.join(process.cwd(), "datasets").replace(/\\/g, "/"),
        "--epochs", String(epochs),
        "--batch_size", String(batchSize),
        "--learning_rate", String(learningRate),
        "--optimizer", optimizer,
        "--image_size", String(imageSize),
        "--seed", String(seed),
        "--checkpoint_dir", CHECKPOINTS_DIR,
        "--num_classes", "1",
        "--class_names", "person",
      ].join(" ");

      const output = execSync(cmd, {
        cwd: AI_DIR,
        timeout: 600000,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });

      trainingResult = { output: output.slice(-2000) };
      trainingSuccess = true;

      const lossMatch = output.match(/Loss:\s*([\d.]+)/);
      const valMatch = output.match(/Val:\s*([\d.]+)/);

      if (lossMatch) trainingResult.trainLoss = parseFloat(lossMatch[1]);
      if (valMatch) trainingResult.valLoss = parseFloat(valMatch[1]);

      const checkpointFiles = fs.readdirSync(CHECKPOINTS_DIR).filter(f => f.endsWith(".pt"));
      if (checkpointFiles.length > 0) {
        const bestCheckpoint = checkpointFiles.find(f => f.includes("best")) || checkpointFiles[checkpointFiles.length - 1];
        trainingResult.checkpointPath = path.join(CHECKPOINTS_DIR, bestCheckpoint);
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
      trainingResult = { error: errorMessage.slice(-2000) };
    }

    // Update experiment with results
    const updateData: Record<string, unknown> = {
      status: trainingSuccess ? "completed" : "failed",
      updatedAt: new Date(),
      trainingDuration: Math.round((Date.now() - new Date(exp.createdAt ?? Date.now()).getTime()) / 1000),
    };

    if (trainingResult.trainLoss !== undefined) updateData.trainLoss = trainingResult.trainLoss;
    if (trainingResult.valLoss !== undefined) updateData.valLoss = trainingResult.valLoss;
    if (trainingResult.checkpointPath) updateData.results = { checkpointPath: trainingResult.checkpointPath };

    await db.update(experiments).set(updateData).where(eq(experiments.id, exp.id));

    // Register model if training succeeded
    let modelRecord = null;
    if (trainingSuccess && trainingResult.checkpointPath) {
      const [model] = await db.insert(models).values({
        modelId: `MODEL-${Date.now()}`,
        name: `${ds.name} Model`,
        version: "1.0",
        architecture: "VisionBharatDetector-CustomCNN",
        datasetId,
        experimentId: exp.id,
        parameterCount: 2670000,
        imageSize,
        numClasses: 1,
        classNames: ["person"],
        status: "trained",
        isFromScratch: true,
        usesPretrained: false,
        checkpointPath: trainingResult.checkpointPath as string,
        trainingDuration: updateData.trainingDuration as number,
        hardware: "CPU",
      }).returning();
      modelRecord = model;

      await db.update(experiments).set({ modelId: model.id }).where(eq(experiments.id, exp.id));
    }

    return Response.json({
      experiment: {
        id: exp.id,
        experimentId: exp.experimentId,
        status: updateData.status,
      },
      model: modelRecord ? {
        id: modelRecord.id,
        modelId: modelRecord.modelId,
        name: modelRecord.name,
      } : null,
      training: {
        success: trainingSuccess,
        epochs,
        trainLoss: trainingResult.trainLoss,
        valLoss: trainingResult.valLoss,
        checkpointPath: trainingResult.checkpointPath,
        errorMessage: trainingSuccess ? undefined : errorMessage.slice(0, 500),
      },
    }, { status: trainingSuccess ? 200 : 500 });
  } catch (error) {
    console.error("[TRAIN] Error:", error);
    return Response.json({ error: "Training failed" }, { status: 500 });
  }
}
