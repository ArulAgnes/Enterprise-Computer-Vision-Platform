import { NextRequest } from "next/server";
import { db } from "@/db";
import { datasets, images, annotations, classes } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { createExportPackage, validateDataset } from "@/lib/kaggle";
import * as schema from "@/db/schema";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { datasetId, slug, title, description, license: lic } = body;

    if (!datasetId || !slug || !title) {
      return Response.json({ error: "datasetId, slug, and title are required" }, { status: 400 });
    }

    const validation = await validateDataset({ datasetId, db: db as unknown as Record<string, unknown>, schema: schema as unknown as Record<string, unknown> });

    if (!validation.valid) {
      return Response.json({
        success: false,
        error: "Dataset validation failed. Fix errors before exporting.",
        validation,
      }, { status: 400 });
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

    const exportDir = createExportPackage({
      slug,
      title,
      description: description || `Dataset: ${dataset[0].name}`,
      classes: classList.map((c) => ({ name: c.name, count: c.count })),
      totalImages: totalImages[0].count,
      totalAnnotations: totalAnnotations[0].count,
      datasetVersion: dataset[0].version || "1.0",
      license: lic || "CC0-1.0",
      validation,
    });

    return Response.json({
      success: true,
      exportDir,
      slug,
      title,
      totalImages: totalImages[0].count,
      totalAnnotations: totalAnnotations[0].count,
      classes: classList.length,
      validation,
    });
  } catch (error: unknown) {
    const e = error as { message?: string };
    return Response.json({ error: e.message || "Export failed" }, { status: 500 });
  }
}
