import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { images } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

/**
 * GET /api/images?datasetId=xxx - List images for a dataset
 * POST /api/images - Record a new image metadata entry
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const datasetId = searchParams.get("datasetId");
    const qualityStatus = searchParams.get("quality");
    const splitType = searchParams.get("split");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    let query = db.select().from(images).orderBy(desc(images.createdAt)).limit(limit).offset(offset);

    const conditions = [];
    if (datasetId) conditions.push(eq(images.datasetId, datasetId));
    if (qualityStatus) conditions.push(eq(images.qualityStatus, qualityStatus));
    if (splitType) conditions.push(eq(images.splitType, splitType));

    const result = conditions.length > 0
      ? await db.select().from(images).where(and(...conditions)).orderBy(desc(images.createdAt)).limit(limit).offset(offset)
      : await db.select().from(images).orderBy(desc(images.createdAt)).limit(limit).offset(offset);

    return NextResponse.json({ success: true, data: result, meta: { limit, offset } });
  } catch (error) {
    console.error("[IMAGE] Error listing images:", error);
    return NextResponse.json({ success: false, error: "Failed to list images" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { datasetId, filename, originalFilename, filepath, resolution, width, height, fileSize, mimeType, imageHash, captureTimestamp, device } = body;

    if (!datasetId || !filename) {
      return NextResponse.json(
        { success: false, error: "datasetId and filename are required" },
        { status: 400 }
      );
    }

    const [newImage] = await db.insert(images).values({
      datasetId,
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
      annotationStatus: "unannotated",
      qualityStatus: "pending",
      classStatus: "unassigned",
    }).returning();

    return NextResponse.json({ success: true, data: newImage }, { status: 201 });
  } catch (error) {
    console.error("[IMAGE] Error creating image record:", error);
    return NextResponse.json({ success: false, error: "Failed to create image record" }, { status: 500 });
  }
}
