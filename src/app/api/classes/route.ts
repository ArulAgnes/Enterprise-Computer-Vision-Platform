import { NextRequest } from "next/server";
import { db } from "@/db";
import { classes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { resolveDatasetIdentifier } from "@/lib/dataset";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const datasetIdParam = url.searchParams.get("datasetId");

    if (!datasetIdParam) {
      return Response.json({ error: "datasetId required" }, { status: 400 });
    }

    const ds = await resolveDatasetIdentifier(datasetIdParam);
    if (!ds) {
      return Response.json({ error: "Dataset not found" }, { status: 404 });
    }

    const result = await db
      .select()
      .from(classes)
      .where(eq(classes.datasetId, ds.id));

    return Response.json({ classes: result, total: result.length });
  } catch (error) {
    console.error("[CLASSES] GET Error:", error);
    return Response.json({ error: "Failed to fetch classes" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { datasetId: datasetIdRaw, name, classIndex, description, color } = body;

    if (!datasetIdRaw || !name || classIndex === undefined) {
      return Response.json({ error: "datasetId, name, and classIndex required" }, { status: 400 });
    }

    const ds = await resolveDatasetIdentifier(datasetIdRaw);
    if (!ds) {
      return Response.json({ error: "Dataset not found" }, { status: 404 });
    }

    const inserted = await db.insert(classes).values({
      datasetId: ds.id,
      name,
      classIndex,
      description: description || null,
      color: color || "#6366f1",
    }).returning();

    return Response.json({ class: inserted[0] }, { status: 201 });
  } catch (error) {
    console.error("[CLASSES] POST Error:", error);
    return Response.json({ error: "Failed to create class" }, { status: 500 });
  }
}
