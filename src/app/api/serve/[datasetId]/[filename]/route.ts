import { NextRequest } from "next/server";
import { readFile } from "fs/promises";
import { existsSync, accessSync } from "fs";
import path from "path";
import { resolveDatasetIdentifier } from "@/lib/dataset";

import { UPLOADS_DIR, DATASETS_DIR } from "@/lib/paths";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ datasetId: string; filename: string }> }
) {
  try {
    const { datasetId: datasetIdRaw, filename } = await params;

    if (!datasetIdRaw || !filename) {
      return Response.json({ error: "Missing datasetId or filename" }, { status: 400 });
    }

    const safeFilename = filename.replace(/[^a-zA-Z0-9_.\-]/g, "_");

    // Resolve dataset identifier to internal UUID for file path lookup
    const ds = await resolveDatasetIdentifier(datasetIdRaw);
    const dsId = ds?.id || datasetIdRaw.replace(/[^a-zA-Z0-9_-]/g, "");

    // Try multiple file locations
    const possiblePaths = [
      path.join(UPLOADS_DIR, dsId, safeFilename),
      path.join(DATASETS_DIR, "images", "train", safeFilename),
    ];

    // Also try the raw datasetId in case it's already a UUID
    if (dsId !== datasetIdRaw) {
      possiblePaths.unshift(path.join(UPLOADS_DIR, datasetIdRaw.replace(/[^a-zA-Z0-9_-]/g, ""), safeFilename));
    }

    let filePath = "";
    for (const p of possiblePaths) {
      try {
        accessSync(p);
        filePath = p;
        break;
      } catch {}
    }

    if (!filePath) {
      return Response.json({ error: "File not found" }, { status: 404 });
    }

    const buffer = await readFile(filePath);

    const ext = path.extname(safeFilename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
      ".gif": "image/gif",
    };
    const contentType = mimeTypes[ext] || "application/octet-stream";

    return new Response(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    console.error("[SERVE] Error:", error);
    return Response.json({ error: "Failed to serve file" }, { status: 500 });
  }
}
