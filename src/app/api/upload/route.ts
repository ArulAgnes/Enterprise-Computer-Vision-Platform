import { NextRequest } from "next/server";
import { db } from "@/db";
import { images, qualityReports, datasets } from "@/db/schema";
import { eq, sql, and } from "drizzle-orm";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { createHash } from "crypto";
import { resolveDatasetIdentifier } from "@/lib/dataset";

import { UPLOADS_DIR } from "@/lib/paths";
const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const ALLOWED_EXT = ["jpg", "jpeg", "png", "webp"];
const MAX_SIZE = 50 * 1024 * 1024;

function sanitizeFilename(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() || "jpg";
  const base = name.replace(/[^a-zA-Z0-9_\-\.]/g, "_").replace(/_+/g, "_").substring(0, 80);
  return `${base}.${ext}`;
}

function computeSHA256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    const datasetIdRaw = formData.get("datasetId") as string;

    if (!datasetIdRaw) {
      return Response.json({ error: "datasetId is required" }, { status: 400 });
    }

    const ds = await resolveDatasetIdentifier(datasetIdRaw);
    if (!ds) {
      return Response.json({ error: "Dataset not found" }, { status: 404 });
    }

    if (!files || files.length === 0) {
      return Response.json({ error: "No files provided" }, { status: 400 });
    }

    const uploadDir = path.join(UPLOADS_DIR, ds.id);
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    const results = [];
    const errors = [];

    for (const file of files) {
      try {
        if (file.size > MAX_SIZE) {
          errors.push({ filename: file.name, error: "File too large (max 50MB)" });
          continue;
        }

        const ext = file.name.split(".").pop()?.toLowerCase() || "";
        if (!ALLOWED_EXT.includes(ext)) {
          errors.push({ filename: file.name, error: "Invalid file type" });
          continue;
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const mimeOk = ALLOWED_TYPES.includes(file.type);
        if (!mimeOk && file.type !== "") {
          errors.push({ filename: file.name, error: "Invalid MIME type" });
          continue;
        }

        const safeName = sanitizeFilename(file.name);
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        const uniqueName = `${safeName.replace(/\.[^.]+$/, "")}_${timestamp}_${random}.${ext}`;
        const filePath = path.join(uploadDir, uniqueName);

        await writeFile(filePath, buffer);

        const sha256 = computeSHA256(buffer);

        const metadata = buffer.length > 0 ? await getImageDimensions(buffer, ext) : null;

        const inserted = await db.insert(images).values({
          datasetId: ds.id,
          filename: uniqueName,
          originalFilename: file.name,
          filepath: filePath,
          width: metadata?.width || null,
          height: metadata?.height || null,
          resolution: metadata ? `${metadata.width}x${metadata.height}` : null,
          fileSize: buffer.length,
          mimeType: file.type || `image/${ext}`,
          imageHash: sha256,
          splitType: "unassigned",
          annotationStatus: "unannotated",
          qualityStatus: "pending",
          isDemo: false,
        }).returning();

        results.push(inserted[0]);
      } catch (err) {
        errors.push({ filename: file.name, error: String(err) });
      }
    }

    return Response.json({
      uploaded: results.length,
      errors: errors.length,
      images: results,
      errorDetails: errors,
    }, { status: 200 });
  } catch (error) {
    console.error("[UPLOAD] Error:", error);
    return Response.json({ error: "Upload failed" }, { status: 500 });
  }
}

async function getImageDimensions(buffer: Buffer, ext: string): Promise<{ width: number; height: number } | null> {
  try {
    if (ext === "jpg" || ext === "jpeg") {
      if (buffer[0] === 0xff && buffer[1] === 0xd8) {
        let offset = 2;
        while (offset < buffer.length - 1) {
          if (buffer[offset] !== 0xff) break;
          const marker = buffer[offset + 1];
          if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
            const height = buffer.readUInt16BE(offset + 5);
            const width = buffer.readUInt16BE(offset + 7);
            return { width, height };
          }
          const segLen = buffer.readUInt16BE(offset + 2);
          offset += 2 + segLen;
        }
      }
    } else if (ext === "png") {
      if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
        const width = buffer.readUInt32BE(16);
        const height = buffer.readUInt32BE(20);
        return { width, height };
      }
    }
    return null;
  } catch {
    return null;
  }
}
