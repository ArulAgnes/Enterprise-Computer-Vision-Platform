import { NextRequest } from "next/server";
import { db } from "@/db";
import { inferenceRuns, models, images } from "@/db/schema";
import { eq } from "drizzle-orm";
import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import { UPLOADS_DIR, PROJECT_ROOT } from "@/lib/paths";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { modelId, imageId, imagePath, confidenceThreshold = 0.3 } = body;

    if (!modelId) {
      return Response.json({ error: "modelId required" }, { status: 400 });
    }

    const model = await db.select().from(models).where(eq(models.id, modelId)).limit(1);
    if (model.length === 0) {
      return Response.json({ error: "Model not found" }, { status: 404 });
    }

    if (!model[0].checkpointPath) {
      return Response.json({
        error: "NO TRAINED CHECKPOINT",
        message: "Model has no trained checkpoint. Train the model first.",
        status: "blocked",
      }, { status: 400 });
    }

    // Determine image path
    let targetImagePath = imagePath;
    let imageData = null;

    if (imageId && !targetImagePath) {
      const img = await db.select().from(images).where(eq(images.id, imageId)).limit(1);
      if (img.length > 0) {
        imageData = img[0];
        targetImagePath = img[0].filepath || path.join(UPLOADS_DIR, img[0].datasetId || "", img[0].filename);
      }
    }

    if (!targetImagePath || !fs.existsSync(targetImagePath)) {
      return Response.json({ error: "Image not found" }, { status: 404 });
    }

    // Run Python inference
    let inferenceResult: Record<string, unknown> = {};
    let inferSuccess = false;

    try {
      const inferScript = path.join(PROJECT_ROOT, "ai", "infer.py");
      const checkpointPath = model[0].checkpointPath;

      const cmd = [
        "python", inferScript,
        "--image", targetImagePath.replace(/\\/g, "/"),
        "--checkpoint", checkpointPath.replace(/\\/g, "/"),
        "--num_classes", "1",
        "--confidence", String(confidenceThreshold),
      ].join(" ");

      const output = execSync(cmd, {
        cwd: path.join(PROJECT_ROOT, "ai"),
        timeout: 120000,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });

      // Parse JSON output from infer.py
      const jsonMatch = output.match(/\{[\s\S]*"detections"[\s\S]*\}/);
      if (jsonMatch) {
        inferenceResult = JSON.parse(jsonMatch[0]);
      } else {
        inferenceResult = {
          detections: [],
          numDetections: 0,
          inferenceTimeMs: 0,
          note: "Inference completed but no structured output parsed",
          rawOutput: output.slice(-1000),
        };
      }
      inferSuccess = true;
    } catch (err) {
      inferenceResult = {
        detections: [],
        numDetections: 0,
        inferenceTimeMs: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    // Save inference run
    const [run] = await db.insert(inferenceRuns).values({
      modelId,
      imageId: imageId || null,
      detections: inferenceResult.detections ?? [],
      numDetections: (inferenceResult.numDetections as number) ?? 0,
      inferenceTimeMs: (inferenceResult.inferenceTimeMs as number) ?? 0,
      imageWidth: imageData?.width ?? (inferenceResult.imageWidth as number) ?? null,
      imageHeight: imageData?.height ?? (inferenceResult.imageHeight as number) ?? null,
      modelVersion: model[0].version || "1.0",
      isDemo: false,
    }).returning();

    return Response.json({
      inference: {
        id: run.id,
        detections: inferenceResult.detections ?? [],
        numDetections: (inferenceResult.numDetections as number) ?? 0,
        inferenceTimeMs: (inferenceResult.inferenceTimeMs as number) ?? 0,
        imageWidth: (inferenceResult.imageWidth as number) ?? imageData?.width ?? null,
        imageHeight: (inferenceResult.imageHeight as number) ?? imageData?.height ?? null,
      },
      model: {
        id: model[0].id,
        name: model[0].name,
        checkpointPath: model[0].checkpointPath,
      },
      success: inferSuccess,
    }, { status: 200 });
  } catch (error) {
    console.error("[INFER] Error:", error);
    return Response.json({ error: "Inference failed" }, { status: 500 });
  }
}
