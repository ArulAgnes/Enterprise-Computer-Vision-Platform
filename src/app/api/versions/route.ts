import { NextRequest } from "next/server";
import { db } from "@/db";
import { datasetVersions, datasets, images, annotations, classes, qualityReports, duplicateGroups } from "@/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { resolveDatasetIdentifier } from "@/lib/dataset";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { datasetId: datasetIdRaw, changeDescription } = body;

    if (!datasetIdRaw) {
      return Response.json({ error: "datasetId required" }, { status: 400 });
    }

    const ds = await resolveDatasetIdentifier(datasetIdRaw);
    if (!ds) {
      return Response.json({ error: "Dataset not found" }, { status: 404 });
    }

    const existingVersions = await db
      .select({ version: datasetVersions.version })
      .from(datasetVersions)
      .where(eq(datasetVersions.datasetId, ds.id))
      .orderBy(desc(datasetVersions.createdAt));

    const currentVersionNum = existingVersions.length > 0
      ? parseFloat(existingVersions[0].version.replace("v", "")) || 0
      : 0;
    const newVersion = `v${(currentVersionNum + 0.1).toFixed(1)}`;

    const imageCount = await db.select({ count: sql<number>`count(*)::int` }).from(images).where(eq(images.datasetId, ds.id));
    const annotationCount = await db.select({ count: sql<number>`count(*)::int` }).from(annotations).where(eq(annotations.datasetId, ds.id));
    const classCount = await db.select({ count: sql<number>`count(*)::int` }).from(classes).where(eq(classes.datasetId, ds.id));
    const qualityCount = await db.select({ count: sql<number>`count(*)::int` }).from(qualityReports).where(eq(qualityReports.datasetId, ds.id));
    const duplicateCount = await db.select({ count: sql<number>`count(*)::int` }).from(duplicateGroups).where(eq(duplicateGroups.datasetId, ds.id));

    const inserted = await db.insert(datasetVersions).values({
      datasetId: ds.id,
      version: newVersion,
      changeDescription: changeDescription || `Version ${newVersion} snapshot`,
      imagesAdded: imageCount[0].count,
      annotationsChanged: annotationCount[0].count,
      classesChanged: classCount[0].count,
    }).returning();

    await db.update(datasets).set({ version: newVersion }).where(eq(datasets.id, ds.id));

    return Response.json({
      version: inserted[0],
      snapshot: {
        images: imageCount[0].count,
        annotations: annotationCount[0].count,
        classes: classCount[0].count,
        qualityReports: qualityCount[0].count,
        duplicateGroups: duplicateCount[0].count,
      },
    }, { status: 201 });
  } catch (error) {
    console.error("[VERSIONS] POST Error:", error);
    return Response.json({ error: "Version creation failed" }, { status: 500 });
  }
}

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

    const versions = await db
      .select()
      .from(datasetVersions)
      .where(eq(datasetVersions.datasetId, ds.id))
      .orderBy(desc(datasetVersions.createdAt));

    return Response.json({ versions, total: versions.length });
  } catch (error) {
    console.error("[VERSIONS] GET Error:", error);
    return Response.json({ error: "Failed to fetch versions" }, { status: 500 });
  }
}
