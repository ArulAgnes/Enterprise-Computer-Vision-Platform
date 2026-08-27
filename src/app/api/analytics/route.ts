import { NextRequest } from "next/server";
import { db } from "@/db";
import { images, annotations, classes, qualityReports, duplicateGroups, datasetSplits, datasets } from "@/db/schema";
import { eq, sql, count } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const datasetId = url.searchParams.get("datasetId");

    if (!datasetId) {
      return Response.json({ error: "datasetId required" }, { status: 400 });
    }

    const dataset = await db.select().from(datasets).where(eq(datasets.id, datasetId)).limit(1);
    if (dataset.length === 0) {
      return Response.json({ error: "Dataset not found" }, { status: 404 });
    }

    const totalImagesResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(images)
      .where(eq(images.datasetId, datasetId));
    const totalImages = totalImagesResult[0].count;

    const totalAnnotationsResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(annotations)
      .where(eq(annotations.datasetId, datasetId));
    const totalAnnotations = totalAnnotationsResult[0].count;

    const classList = await db
      .select()
      .from(classes)
      .where(eq(classes.datasetId, datasetId));

    const perClassDistribution = await db
      .select({
        className: annotations.className,
        count: sql<number>`count(*)::int`,
      })
      .from(annotations)
      .where(eq(annotations.datasetId, datasetId))
      .groupBy(annotations.className);

    const splitDistribution = await db
      .select({
        splitType: images.splitType,
        count: sql<number>`count(*)::int`,
      })
      .from(images)
      .where(eq(images.datasetId, datasetId))
      .groupBy(images.splitType);

    const qualityDistribution = await db
      .select({
        qualityFlag: images.qualityStatus,
        count: sql<number>`count(*)::int`,
      })
      .from(images)
      .where(eq(images.datasetId, datasetId))
      .groupBy(images.qualityStatus);

    const qualityStats = await db
      .select({
        avgBrightness: sql<number>`avg(${qualityReports.brightness})`,
        avgContrast: sql<number>`avg(${qualityReports.contrast})`,
        avgBlur: sql<number>`avg(${qualityReports.blurScore})`,
        avgEntropy: sql<number>`avg(${qualityReports.entropy})`,
      })
      .from(qualityReports)
      .where(eq(qualityReports.datasetId, datasetId));

    const duplicateCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(duplicateGroups)
      .where(eq(duplicateGroups.datasetId, datasetId));

    const totalClassBalance = perClassDistribution.reduce((sum, c) => sum + c.count, 0);
    const classBalance = perClassDistribution.map(c => ({
      className: c.className,
      count: c.count,
      percentage: totalClassBalance > 0 ? Math.round((c.count / totalClassBalance) * 10000) / 100 : 0,
    }));

    return Response.json({
      totalImages,
      totalAnnotations,
      totalClasses: classList.length,
      classes: classList,
      perClassDistribution: classBalance,
      splitDistribution: splitDistribution.reduce((acc, s) => {
        acc[s.splitType || "unassigned"] = s.count;
        return acc;
      }, {} as Record<string, number>),
      qualityDistribution: qualityDistribution.reduce((acc, q) => {
        acc[q.qualityFlag || "pending"] = q.count;
        return acc;
      }, {} as Record<string, number>),
      qualityStats: qualityStats[0] || { avgBrightness: 0, avgContrast: 0, avgBlur: 0, avgEntropy: 0 },
      duplicateGroups: duplicateCount[0].count,
    });
  } catch (error) {
    console.error("[ANALYTICS] Error:", error);
    return Response.json({ error: "Analytics computation failed" }, { status: 500 });
  }
}
