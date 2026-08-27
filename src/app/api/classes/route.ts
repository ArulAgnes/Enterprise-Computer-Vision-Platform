import { NextRequest } from "next/server";
import { db } from "@/db";
import { classes } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const datasetId = url.searchParams.get("datasetId");

    if (!datasetId) {
      return Response.json({ error: "datasetId required" }, { status: 400 });
    }

    const result = await db
      .select()
      .from(classes)
      .where(eq(classes.datasetId, datasetId));

    return Response.json({ classes: result, total: result.length });
  } catch (error) {
    console.error("[CLASSES] GET Error:", error);
    return Response.json({ error: "Failed to fetch classes" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { datasetId, name, classIndex, description, color } = body;

    if (!datasetId || !name || classIndex === undefined) {
      return Response.json({ error: "datasetId, name, and classIndex required" }, { status: 400 });
    }

    const inserted = await db.insert(classes).values({
      datasetId,
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
