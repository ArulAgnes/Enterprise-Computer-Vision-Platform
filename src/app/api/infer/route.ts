/**
 * POST /api/infer — INVENTION 2: universal inference (upload / paste / webcam)
 * ============================================================================
 * Accepts EITHER:
 *   • multipart/form-data with `file` (or `files`) — drag & drop, camera capture
 *   • application/json { base64: "data:image/jpeg;base64,...", source: "paste"|"webcam" }
 *   • application/json { imageId } — a dataset image already stored in the DB
 *
 * Runs `ai/infer.py` (VisionBharat V2, dynamic class list) and answers with the
 * detections plus a servable URL of the OpenCV-annotated frame:
 *   { predictions:[{class,confidence,bbox}], annotated_image_url, time_ms }
 */
import { NextRequest } from "next/server";

import { db } from "@/db";
import { images } from "@/db/schema";
import { eq } from "drizzle-orm";
import { extensionFor, runInference, writeTempImage } from "@/lib/inference";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";
  let tempPath: string | null = null;

  try {
    let imagePath: string | null = null;
    let base64: string | null = null;
    let source = "upload";
    let confidence = 0.25;
    let modelPath: string | null = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = (form.get("file") || form.get("files") || form.get("image")) as File | null;
      source = String(form.get("source") || "upload");
      confidence = Number(form.get("confidence") ?? form.get("confidenceThreshold") ?? 0.25);
      modelPath = (form.get("modelPath") as string) || null;

      if (!file) {
        return Response.json({ error: "No file provided (field name: file)" }, { status: 400 });
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      tempPath = writeTempImage(buffer, extensionFor(file.type));
      imagePath = tempPath;
    } else {
      const body = await request.json().catch(() => ({}));
      base64 = body.base64 ?? body.image ?? null;
      source = String(body.source || (base64 ? "paste" : "upload"));
      confidence = Number(body.confidence ?? body.confidenceThreshold ?? 0.25);
      modelPath = body.modelPath ?? null;

      if (body.imageId) {
        const rows = await db.select().from(images).where(eq(images.id, body.imageId)).limit(1);
        if (rows.length > 0 && rows[0].filepath) {
          imagePath = rows[0].filepath;
          base64 = null;
        }
      }
      if (!imagePath && !base64) {
        return Response.json({ error: "Provide `file` (multipart), `base64`, or `imageId`" }, { status: 400 });
      }
    }

    const result = await runInference({ imagePath, base64, confidence, modelPath });

    if (!result.ok) {
      return Response.json(
        {
          error: result.error || "Inference failed",
          predictions: [],
          checkpointHint: "Train a model first: POST /api/pipeline/run",
          logs: result.logs.slice(-20),
        },
        { status: 400 }
      );
    }

    return Response.json({
      success: true,
      source,
      predictions: result.predictions,
      detections: result.predictions,
      numDetections: result.predictions.length,
      annotated_image_url: result.annotatedImageUrl,
      annotated_image_path: result.annotatedImagePath,
      time_ms: result.timeMs,
      inferenceTimeMs: result.timeMs,
      image_width: result.imageWidth,
      image_height: result.imageHeight,
      classes: result.classes,
      model_path: result.modelPath,
      model: {
        name: "VisionBharat V2",
        parameters: 5_583_441,
        from_scratch: true,
        pretrained_used: false,
      },
      invention: "Paste-to-Predict (Ctrl+V anywhere) + Live OpenCV stream",
    });
  } catch (error) {
    console.error("[INFER] Error:", error);
    return Response.json({ error: error instanceof Error ? error.message : "Inference failed" }, { status: 500 });
  } finally {
    if (tempPath) {
      // Keep the frame for a few minutes so the annotated image survives; the OS
      // temp cleanup handles the rest. (Deleting immediately would race the read.)
      setTimeout(() => {
        import("fs").then((fs) => fs.promises.unlink(tempPath!).catch(() => undefined));
      }, 10 * 60 * 1000);
    }
  }
}

/** GET /api/infer — inference readiness + rolling stats. */
export async function GET() {
  const { latestInferenceStats, resolveCheckpoint } = await import("@/lib/inference");
  const { modelArtifacts } = await import("@/lib/ai-pipeline");
  const checkpoint = await resolveCheckpoint(null);
  return Response.json({
    ready: !!checkpoint,
    checkpoint,
    stats: await latestInferenceStats(),
    artifacts: modelArtifacts(),
  });
}
