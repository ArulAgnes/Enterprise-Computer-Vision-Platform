import { NextRequest } from "next/server";
import { db } from "@/db";
import { annotations, images, classes } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const imageId = url.searchParams.get("imageId");
    const datasetId = url.searchParams.get("datasetId");

    if (!imageId && !datasetId) {
      return Response.json({ error: "imageId or datasetId required" }, { status: 400 });
    }

    let query = db.select().from(annotations);
    if (imageId) {
      query = query.where(eq(annotations.imageId, imageId)) as typeof query;
    } else if (datasetId) {
      query = query.where(eq(annotations.datasetId, datasetId)) as typeof query;
    }

    const result = await query.limit(5000);
    return Response.json({ annotations: result, total: result.length });
  } catch (error) {
    console.error("[ANNOTATIONS] GET Error:", error);
    return Response.json({ error: "Failed to fetch annotations" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageId, datasetId, classId, className, x, y, width, height, imageWidth, imageHeight } = body;

    if (!imageId || !datasetId || !className || x === undefined || y === undefined || width === undefined || height === undefined) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (width <= 0 || height <= 0) {
      return Response.json({ error: "Width and height must be positive" }, { status: 400 });
    }

    if (x < 0 || y < 0) {
      return Response.json({ error: "Coordinates must be non-negative" }, { status: 400 });
    }

    const normalizedX = imageWidth ? x / imageWidth : x;
    const normalizedY = imageHeight ? y / imageHeight : y;
    const normalizedW = imageWidth ? width / imageWidth : width;
    const normalizedH = imageHeight ? height / imageHeight : height;

    if (normalizedX < 0 || normalizedX > 1 || normalizedY < 0 || normalizedY > 1 ||
        normalizedW < 0 || normalizedW > 1 || normalizedH < 0 || normalizedH > 1) {
      return Response.json({ error: "Normalized coordinates out of range [0,1]" }, { status: 400 });
    }

    const inserted = await db.insert(annotations).values({
      imageId,
      datasetId,
      classId: classId || null,
      className,
      x,
      y,
      width,
      height,
      normalizedX,
      normalizedY,
      normalizedW,
      normalizedH,
      isValid: true,
    }).returning();

    await db.update(images)
      .set({ annotationStatus: "annotated" })
      .where(eq(images.id, imageId));

    return Response.json({ annotation: inserted[0] }, { status: 201 });
  } catch (error) {
    console.error("[ANNOTATIONS] POST Error:", error);
    return Response.json({ error: "Failed to create annotation" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, x, y, width, height, classId, className, imageWidth, imageHeight } = body;

    if (!id) {
      return Response.json({ error: "Annotation ID required" }, { status: 400 });
    }

    const existing = await db.select().from(annotations).where(eq(annotations.id, id)).limit(1);
    if (existing.length === 0) {
      return Response.json({ error: "Annotation not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (x !== undefined) updateData.x = x;
    if (y !== undefined) updateData.y = y;
    if (width !== undefined) updateData.width = width;
    if (height !== undefined) updateData.height = height;
    if (classId !== undefined) updateData.classId = classId;
    if (className !== undefined) updateData.className = className;

    if (x !== undefined && y !== undefined && width !== undefined && height !== undefined) {
      if (width <= 0 || height <= 0) {
        return Response.json({ error: "Width and height must be positive" }, { status: 400 });
      }
      updateData.normalizedX = imageWidth ? x / imageWidth : x;
      updateData.normalizedY = imageHeight ? y / imageHeight : y;
      updateData.normalizedW = imageWidth ? width / imageWidth : width;
      updateData.normalizedH = imageHeight ? height / imageHeight : height;
    }

    const updated = await db.update(annotations)
      .set(updateData)
      .where(eq(annotations.id, id))
      .returning();

    return Response.json({ annotation: updated[0] });
  } catch (error) {
    console.error("[ANNOTATIONS] PUT Error:", error);
    return Response.json({ error: "Failed to update annotation" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return Response.json({ error: "Annotation ID required" }, { status: 400 });
    }

    const existing = await db.select().from(annotations).where(eq(annotations.id, id)).limit(1);
    if (existing.length === 0) {
      return Response.json({ error: "Annotation not found" }, { status: 404 });
    }

    const deletedImageId = existing[0].imageId;
    await db.delete(annotations).where(eq(annotations.id, id));

    if (deletedImageId) {
      const remainingCount = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(annotations)
        .where(eq(annotations.imageId, deletedImageId));

      if (remainingCount[0].count === 0) {
        await db.update(images)
          .set({ annotationStatus: "unannotated" })
          .where(eq(images.id, deletedImageId));
      }
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("[ANNOTATIONS] DELETE Error:", error);
    return Response.json({ error: "Failed to delete annotation" }, { status: 500 });
  }
}
