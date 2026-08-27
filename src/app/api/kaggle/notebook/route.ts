import { NextRequest } from "next/server";
import { db } from "@/db";
import { datasets, images, annotations, classes } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { generateNotebook } from "@/lib/kaggle";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { datasetId, slug, title } = body;

    if (!datasetId || !slug || !title) {
      return Response.json({ error: "datasetId, slug, and title are required" }, { status: 400 });
    }

    const dataset = await db.select().from(datasets).where(eq(datasets.id, datasetId)).limit(1);
    if (dataset.length === 0) {
      return Response.json({ error: "Dataset not found" }, { status: 404 });
    }

    const totalImages = await db.select({ count: sql<number>`count(*)::int` }).from(images).where(eq(images.datasetId, datasetId));
    const totalAnnotations = await db.select({ count: sql<number>`count(*)::int` }).from(annotations).where(eq(annotations.datasetId, datasetId));
    const classList = await db.select({
      name: classes.name,
      count: sql<number>`coalesce(sum(${classes.annotationCount}), 0)::int`,
    }).from(classes).where(eq(classes.datasetId, datasetId));

    const result = generateNotebook({
      slug,
      title,
      classes: classList.map((c) => ({ name: c.name, count: c.count })),
      totalImages: totalImages[0].count,
      totalAnnotations: totalAnnotations[0].count,
      datasetVersion: dataset[0].version || "1.0",
    });

    return Response.json(result);
  } catch (error: unknown) {
    const e = error as { message?: string };
    return Response.json({ success: false, error: e.message || "Notebook generation failed" }, { status: 500 });
  }
}
