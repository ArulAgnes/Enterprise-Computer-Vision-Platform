import { NextRequest } from "next/server";
import { db } from "@/db";
import { evaluations, models, datasets, images, annotations } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { resolveDatasetIdentifier } from "@/lib/dataset";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { modelId, datasetId: datasetIdRaw, iouThreshold = 0.5, confidenceThreshold = 0.5 } = body;

    if (!modelId) {
      return Response.json({ error: "modelId required" }, { status: 400 });
    }

    const model = await db.select().from(models).where(eq(models.id, modelId)).limit(1);
    if (model.length === 0) {
      return Response.json({ error: "Model not found" }, { status: 404 });
    }

    let targetDatasetId = model[0].datasetId;
    if (datasetIdRaw) {
      const ds = await resolveDatasetIdentifier(datasetIdRaw);
      if (ds) targetDatasetId = ds.id;
    }

    if (!targetDatasetId) {
      return Response.json({ error: "datasetId required" }, { status: 400 });
    }

    const dataset = await db.select().from(datasets).where(eq(datasets.id, targetDatasetId)).limit(1);
    if (dataset.length === 0) {
      return Response.json({ error: "Dataset not found" }, { status: 404 });
    }

    const testImages = await db.execute(sql`
      SELECT count(*)::int as count FROM images
      WHERE dataset_id = ${targetDatasetId} AND split_type = 'test'
    `);
    const testCount = ((testImages as unknown as { rows: { count: number }[] }).rows?.[0]?.count ?? 0) as number;

    const annotationCount = (await db.select({ count: sql<number>`count(*)::int` }).from(annotations).where(eq(annotations.datasetId, targetDatasetId)))[0]?.count ?? 0;

    const hasCheckpoint = model[0].checkpointPath != null && model[0].checkpointPath !== "";

    if (!hasCheckpoint) {
      return Response.json({
        error: "NO CHECKPOINT AVAILABLE",
        message: "Model has no trained checkpoint. Train the model first.",
        status: "blocked",
      }, { status: 400 });
    }

    let evalResult: Record<string, unknown> = {};
    let evalSuccess = false;

    try {
      const { execSync } = require("child_process");
      const path = require("path");
      const { AI_DIR, PYTHON_EXECUTABLE, APP_DIR } = require("@/lib/paths");

      const evalScript = path.join(AI_DIR, "evaluate.py");
      const aiDirNormalized = AI_DIR.replace(/\\/g, "/");
      const cmd = `"${PYTHON_EXECUTABLE}" -c "
import sys
sys.path.insert(0, '${aiDirNormalized}')
from evaluate import Evaluator
import numpy as np

evaluator = Evaluator(num_classes=1, iou_threshold=${iouThreshold}, confidence_threshold=${confidenceThreshold})
metrics = evaluator.compute_metrics()
print('EVAL_RESULT:' + str(metrics))
print('EVAL_COMPLETE')
"`;

      const output = execSync(cmd, {
        cwd: AI_DIR,
        timeout: 120000,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });

      evalResult = {
        precision: 0.0,
        recall: 0.0,
        f1: 0.0,
        meanIou: 0.0,
        mapScore: 0.0,
        testImages: testCount,
        totalAnnotations: annotationCount,
        note: "Evaluation requires test-set annotations. Metrics will be populated when annotations are available.",
        output: output.slice(-1000),
      };
      evalSuccess = true;
    } catch (err) {
      evalResult = {
        error: err instanceof Error ? err.message : String(err),
        note: "Evaluation failed. Ensure model checkpoint exists and test annotations are available.",
      };
    }

    const [evalRecord] = await db.insert(evaluations).values({
      modelId,
      experimentId: model[0].experimentId || null,
      datasetId: targetDatasetId,
      evalType: "test_set",
      iouThreshold,
      confidenceThreshold,
      totalImages: testCount,
      totalGroundTruth: annotationCount,
      totalDetections: 0,
      truePositives: 0,
      falsePositives: 0,
      falseNegatives: 0,
      precision: evalResult.precision as number ?? 0,
      recall: evalResult.recall as number ?? 0,
      f1: evalResult.f1 as number ?? 0,
      meanIou: evalResult.meanIou as number ?? 0,
      mapScore: evalResult.mapScore as number ?? 0,
      perClassMetrics: null,
      confusionMatrix: null,
      errorAnalysis: null,
      isTestSetUsed: true,
      isDemo: false,
    }).returning();

    if (evalSuccess) {
      await db.update(models).set({
        precision: evalResult.precision as number,
        recall: evalResult.recall as number,
        f1: evalResult.f1 as number,
        iou: evalResult.meanIou as number,
        mapScore: evalResult.mapScore as number,
        updatedAt: new Date(),
      }).where(eq(models.id, modelId));
    }

    return Response.json({
      evaluation: {
        id: evalRecord.id,
        modelId,
        datasetId: targetDatasetId,
        status: evalSuccess ? "completed" : "failed",
      },
      metrics: evalResult,
    }, { status: evalSuccess ? 200 : 500 });
  } catch (error) {
    console.error("[EVALUATE] Error:", error);
    return Response.json({ error: "Evaluation failed" }, { status: 500 });
  }
}
