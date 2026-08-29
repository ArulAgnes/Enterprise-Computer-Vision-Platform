import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { images, datasets } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { resolveDatasetIdentifier } from "@/lib/dataset";

/**
 * GET /api/images?datasetId=xxx - List images for a dataset
 * POST /api/images - Record a new image metadata entry
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const datasetIdParam = searchParams.get("datasetId");
    const qualityStatus = searchParams.get("quality");
    const splitType = searchParams.get("split");
    const limit = parseInt(searchParams.get("limit") || "500");
    const offset = parseInt(searchParams.get("offset") || "0");

    const conditions = [];
    if (datasetIdParam) {
      const ds = await resolveDatasetIdentifier(datasetIdParam);
      if (!ds) {
        return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
      }
      conditions.push(eq(images.datasetId, ds.id));
    }
    if (qualityStatus) conditions.push(eq(images.qualityStatus, qualityStatus));
    if (splitType) conditions.push(eq(images.splitType, splitType));

    const result = conditions.length > 0
      ? await db.select().from(images).where(and(...conditions)).orderBy(desc(images.createdAt)).limit(limit).offset(offset)
      : await db.select().from(images).orderBy(desc(images.createdAt)).limit(limit).offset(offset);

    const totalResult = conditions.length > 0
      ? await db.select({ count: sql<number>`count(*)::int` }).from(images).where(and(...conditions))
      : await db.select({ count: sql<number>`count(*)::int` }).from(images);

    return NextResponse.json({
      success: true,
      data: result,
      total: totalResult[0]?.count ?? result.length,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[IMAGE] Error listing images:", msg);
    return NextResponse.json({ success: false, error: "Failed to list images", detail: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { datasetId: datasetIdRaw, filename, originalFilename, filepath, resolution, width, height, fileSize, mimeType, imageHash, captureTimestamp, device } = body;

    if (!datasetIdRaw || !filename) {
      return NextResponse.json(
        { success: false, error: "datasetId and filename are required" },
        { status: 400 }
      );
    }

    const ds = await resolveDatasetIdentifier(datasetIdRaw);
    if (!ds) {
      return NextResponse.json({ success: false, error: "Dataset not found" }, { status: 404 });
    }

    const [newImage] = await db.insert(images).values({
      datasetId: ds.id,
      filename,
      originalFilename: originalFilename || null,
      filepath: filepath || null,
      resolution: resolution || null,
      width: width || null,
      height: height || null,
      fileSize: fileSize || null,
      mimeType: mimeType || null,
      imageHash: imageHash || null,
      captureTimestamp: captureTimestamp ? new Date(captureTimestamp) : null,
      device: device || null,
      splitType: "unassigned",
      annotationStatus: "unannotated",
      qualityStatus: "pending",
      classStatus: "unassigned",
      isDemo: false,
    }).returning();

    return NextResponse.json(newImage, { status: 201 });
  } catch (error) {
    console.error("[IMAGE] Error creating image record:", error);
    return NextResponse.json({ success: false, error: "Failed to create image record" }, { status: 500 });
  }
}
