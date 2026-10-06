/**
 * GET /api/serve/:datasetId/:filename
 * ==================================
 * Serves image bytes from every location the platform produces:
 *   • uploads/<datasetId>/<file>            (user uploads)
 *   • captured_photos/<folder>/<file>       (team photos, incl. /augmented)
 *   • datasets/images/train/<file>          (exported dataset)
 *   • outputs/inference/<file>              (annotated inference frames)
 *
 * `/api/serve/inference/<file>` is the URL returned by /api/infer.
 */
import { NextRequest } from "next/server";
import { readFile } from "fs/promises";
import { accessSync } from "fs";
import path from "path";
import { resolveDatasetIdentifier } from "@/lib/dataset";

import { AUGMENTED_DIR, CAPTURED_PHOTOS_DIR, DATASETS_DIR, INFERENCE_OUTPUT_DIR, UPLOADS_DIR } from "@/lib/paths";

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ datasetId: string; filename: string }> }
) {
  try {
    const { datasetId: datasetIdRaw, filename } = await params;
    if (!datasetIdRaw || !filename) {
      return Response.json({ error: "Missing datasetId or filename" }, { status: 400 });
    }

    const url = new URL(request.url);
    const dirHint = url.searchParams.get("dir");
    const safeFilename = path.basename(filename).replace(/[^a-zA-Z0-9_.\-]/g, "_");

    // Resolve dataset identifier to internal UUID for file path lookup
    const ds = await resolveDatasetIdentifier(datasetIdRaw).catch(() => null);
    const dsId = ds?.id || datasetIdRaw.replace(/[^a-zA-Z0-9_-]/g, "");

    const possiblePaths: string[] = [];

    if (datasetIdRaw === "inference") {
      possiblePaths.push(path.join(INFERENCE_OUTPUT_DIR, safeFilename));
    }
    if (dirHint === "augmented" || datasetIdRaw === "augmented") {
      possiblePaths.push(path.join(AUGMENTED_DIR, safeFilename));
    }

    possiblePaths.push(
      path.join(UPLOADS_DIR, dsId, safeFilename),
      path.join(UPLOADS_DIR, datasetIdRaw, safeFilename),
      path.join(DATASETS_DIR, "images", "train", safeFilename),
      path.join(CAPTURED_PHOTOS_DIR, safeFilename),
      path.join(AUGMENTED_DIR, safeFilename),
      path.join(CAPTURED_PHOTOS_DIR, "bell", safeFilename),
      path.join(CAPTURED_PHOTOS_DIR, "oillamp", safeFilename),
      path.join(INFERENCE_OUTPUT_DIR, safeFilename)
    );

    let filePath = "";
    for (const candidate of possiblePaths) {
      try {
        accessSync(candidate);
        filePath = candidate;
        break;
      } catch {
        /* try next */
      }
    }

    if (!filePath) {
      return Response.json({ error: "File not found", tried: possiblePaths }, { status: 404 });
    }

    const buffer = await readFile(filePath);
    const ext = path.extname(safeFilename).toLowerCase();

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    console.error("[SERVE] Error:", error);
    return Response.json({ error: "Failed to serve file" }, { status: 500 });
  }
}

export async function HEAD(
  request: NextRequest,
  context: { params: Promise<{ datasetId: string; filename: string }> }
) {
  const response = await GET(request, context);
  return new Response(null, { status: response.status, headers: response.headers });
}
