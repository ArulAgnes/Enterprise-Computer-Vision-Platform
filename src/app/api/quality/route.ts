import { NextRequest } from "next/server";
import { db } from "@/db";
import { images, qualityReports, datasets } from "@/db/schema";
import { eq, sql, and } from "drizzle-orm";
import { readFile } from "fs/promises";
import path from "path";
import { resolveDatasetIdentifier } from "@/lib/dataset";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageId, datasetId: datasetIdRaw } = body;

    if (!imageId && !datasetIdRaw) {
      return Response.json({ error: "imageId or datasetId required" }, { status: 400 });
    }

    let targetImages;
    if (imageId) {
      targetImages = await db.select().from(images).where(eq(images.id, imageId)).limit(1);
    } else {
      const ds = await resolveDatasetIdentifier(datasetIdRaw);
      if (!ds) {
        return Response.json({ error: "Dataset not found" }, { status: 404 });
      }
      targetImages = await db.select().from(images).where(eq(images.datasetId, ds.id));
    }

    if (!targetImages || targetImages.length === 0) {
      return Response.json({ error: "No images found" }, { status: 404 });
    }

    const results = [];

    for (const img of targetImages) {
      try {
        // Resolve the actual file path - try multiple locations
        const filePath = await resolveImagePath(img);

        let fileBuffer: Buffer;
        try {
          fileBuffer = await readFile(filePath);
        } catch {
          // File not found at any resolved path
          await db.insert(qualityReports).values({
            imageId: img.id,
            datasetId: img.datasetId,
            brightness: 0,
            contrast: 0,
            blurScore: 0,
            sharpness: 0,
            noiseEstimate: 0,
            entropy: 0,
            exposureEstimate: 0,
            aspectRatio: img.width && img.height ? img.width / img.height : 0,
            isBlurry: false,
            isDark: false,
            isOverexposed: false,
            isTiny: (img.width || 0) < 100 || (img.height || 0) < 100,
            isCorrupt: true,
            qualityScore: 0,
            qualityFlag: "red",
            reviewNotes: "File not found on disk",
          });
          await db.update(images).set({ qualityStatus: "error" }).where(eq(images.id, img.id));
          continue;
        }

        const brightness = computeBrightness(fileBuffer);
        const contrast = computeContrast(fileBuffer);
        const blurScore = computeBlurScore(fileBuffer);
        const entropy = computeEntropy(fileBuffer);
        const aspectRatio = img.width && img.height ? img.width / img.height : 0;

        const isBlurry = blurScore < 50;
        const isDark = brightness < 40;
        const isOverexposed = brightness > 220;
        const isTiny = (img.width || 0) < 100 || (img.height || 0) < 100;
        const isCorrupt = fileBuffer.length < 100;

        let qualityScore = 100;
        if (isBlurry) qualityScore -= 30;
        if (isDark) qualityScore -= 20;
        if (isOverexposed) qualityScore -= 20;
        if (isTiny) qualityScore -= 15;
        if (isCorrupt) qualityScore -= 50;
        qualityScore = Math.max(0, Math.min(100, qualityScore));

        let qualityFlag = "green";
        if (qualityScore < 50) qualityFlag = "red";
        else if (qualityScore < 75) qualityFlag = "yellow";

        // Delete any existing quality report for this image to avoid duplicates
        await db.delete(qualityReports).where(eq(qualityReports.imageId, img.id));

        await db.insert(qualityReports).values({
          imageId: img.id,
          datasetId: img.datasetId,
          brightness,
          contrast,
          blurScore,
          sharpness: blurScore,
          noiseEstimate: estimateNoise(fileBuffer),
          entropy,
          exposureEstimate: brightness / 255,
          aspectRatio,
          isBlurry,
          isDark,
          isOverexposed,
          isTiny,
          isCorrupt,
          isDuplicate: false,
          qualityScore,
          qualityFlag,
        });

        await db.update(images).set({ qualityStatus: qualityFlag }).where(eq(images.id, img.id));

        results.push({
          imageId: img.id,
          filename: img.filename,
          brightness,
          contrast,
          blurScore,
          entropy,
          qualityScore,
          qualityFlag,
          isBlurry,
          isDark,
          isOverexposed,
          isTiny,
          isCorrupt,
        });
      } catch (err) {
        results.push({ imageId: img.id, error: String(err) });
      }
    }

    return Response.json({
      analyzed: results.length,
      results,
    });
  } catch (error) {
    console.error("[QUALITY] Error:", error);
    return Response.json({ error: "Quality analysis failed" }, { status: 500 });
  }
}

async function resolveImagePath(img: { filepath?: string | null; datasetId?: string | null; filename: string }): Promise<string> {
  // Try stored filepath first
  if (img.filepath) {
    try {
      const { accessSync } = await import("fs");
      accessSync(img.filepath);
      return img.filepath;
    } catch {}
  }

  // Try uploads/{datasetId}/{filename}
  if (img.datasetId) {
    const p = path.join(UPLOADS_DIR, img.datasetId, img.filename);
    try {
      const { accessSync } = await import("fs");
      accessSync(p);
      return p;
    } catch {}
  }

  // Try datasets/images/train/{filename}
  const trainPath = path.join(process.cwd(), "datasets", "images", "train", img.filename);
  try {
    const { accessSync } = await import("fs");
    accessSync(trainPath);
    return trainPath;
  } catch {}

  // Return the stored path even if missing (will be caught later)
  return img.filepath || path.join(UPLOADS_DIR, img.datasetId || "", img.filename);
}

function computeBrightness(buffer: Buffer): number {
  let sum = 0;
  const sampleSize = Math.min(buffer.length, 10000);
  const step = Math.max(1, Math.floor(buffer.length / sampleSize));
  for (let i = 0; i < buffer.length; i += step) {
    sum += buffer[i];
  }
  return Math.round((sum / (buffer.length / step)) * 100) / 100;
}

function computeContrast(buffer: Buffer): number {
  let sum = 0;
  let sumSq = 0;
  const n = Math.min(buffer.length, 10000);
  const step = Math.max(1, Math.floor(buffer.length / n));
  let count = 0;
  for (let i = 0; i < buffer.length; i += step) {
    const val = buffer[i];
    sum += val;
    sumSq += val * val;
    count++;
  }
  const mean = sum / count;
  const variance = sumSq / count - mean * mean;
  return Math.round(Math.sqrt(Math.max(0, variance)) * 100) / 100;
}

function computeBlurScore(buffer: Buffer): number {
  let edgeSum = 0;
  let count = 0;
  const n = Math.min(buffer.length - 2, 5000);
  const step = Math.max(1, Math.floor(n / 5000));
  for (let i = 1; i < n; i += step) {
    const diff = Math.abs(buffer[i] - buffer[i - 1]);
    edgeSum += diff;
    count++;
  }
  return count > 0 ? Math.round((edgeSum / count) * 100) / 100 : 0;
}

function computeEntropy(buffer: Buffer): number {
  const freq = new Array(256).fill(0);
  const n = Math.min(buffer.length, 50000);
  const step = Math.max(1, Math.floor(n / 50000));
  let count = 0;
  for (let i = 0; i < buffer.length; i += step) {
    freq[buffer[i]]++;
    count++;
  }
  let entropy = 0;
  for (let i = 0; i < 256; i++) {
    if (freq[i] > 0) {
      const p = freq[i] / count;
      entropy -= p * Math.log2(p);
    }
  }
  return Math.round(entropy * 100) / 100;
}

function estimateNoise(buffer: Buffer): number {
  if (buffer.length < 100) return 0;
  let sum = 0;
  let count = 0;
  const n = Math.min(buffer.length - 1, 5000);
  for (let i = 1; i < n; i += 3) {
    sum += Math.abs(buffer[i] - buffer[i - 1]);
    count++;
  }
  return count > 0 ? Math.round((sum / count) * 100) / 100 : 0;
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const datasetIdParam = url.searchParams.get("datasetId");

    let query = db.select().from(qualityReports);
    if (datasetIdParam) {
      const ds = await resolveDatasetIdentifier(datasetIdParam);
      if (!ds) {
        return Response.json({ error: "Dataset not found" }, { status: 404 });
      }
      query = query.where(eq(qualityReports.datasetId, ds.id)) as typeof query;
    }

    const reports = await query.limit(10000);
    return Response.json({ reports, total: reports.length });
  } catch (error) {
    console.error("[QUALITY] GET Error:", error);
    return Response.json({ error: "Failed to fetch quality reports" }, { status: 500 });
  }
}
