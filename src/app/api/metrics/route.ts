import { db } from "@/db";
import {
  datasets, images, annotations, classes, qualityReports,
  duplicateGroups, trainingMetrics, experiments, activityLog,
  datasetSplits,
} from "@/db/schema";
import { sql, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#06b6d4", "#f97316"];

export async function GET() {
  try {
    const [
      datasetCount,
      imageCount,
      annotatedCount,
      annotationCountResult,
      duplicateCount,
      classList,
      qualityDist,
      splitDist,
      latestExperiment,
      trainingHistoryRows,
      recentActivities,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(datasets),
      db.select({ count: sql<number>`count(*)::int` }).from(images),
      db.select({ count: sql<number>`count(*)::int` }).from(images).where(eq(images.annotationStatus, "annotated")),
      db.select({ count: sql<number>`count(*)::int` }).from(annotations),
      db.select({ count: sql<number>`count(*)::int` }).from(duplicateGroups),
      db.select({
        name: classes.name,
        count: sql<number>`coalesce(sum(${classes.annotationCount}), 0)::int`,
      }).from(classes),
      db.select({
        qualityFlag: images.qualityStatus,
        count: sql<number>`count(*)::int`,
      }).from(images).groupBy(images.qualityStatus),
      db.select({
        splitType: images.splitType,
        count: sql<number>`count(*)::int`,
      }).from(images).groupBy(images.splitType),
      db.select().from(experiments).orderBy(experiments.createdAt).limit(1),
      db.select().from(trainingMetrics).orderBy(trainingMetrics.epoch).limit(100),
      db.select().from(activityLog).orderBy(activityLog.timestamp).limit(10),
    ]);

    const classesWithColors = classList.map((c, i) => ({
      name: c.name,
      count: c.count,
      color: COLORS[i % COLORS.length],
    }));

    const qualityColorMap: Record<string, string> = {
      green: "#10b981",
      yellow: "#f59e0b",
      red: "#ef4444",
      pending: "#64748b",
      error: "#64748b",
    };
    const qualityDistribution = qualityDist.map((q) => ({
      name: q.qualityFlag || "pending",
      value: q.count,
      color: qualityColorMap[q.qualityFlag || "pending"] || "#64748b",
    }));

    const splitColorMap: Record<string, string> = {
      train: "#3b82f6",
      val: "#10b981",
      test: "#f59e0b",
      unassigned: "#64748b",
    };
    const splitDistribution = splitDist.map((s) => ({
      name: s.splitType || "unassigned",
      value: s.count,
      color: splitColorMap[s.splitType || "unassigned"] || "#64748b",
    }));

    const trainingHistory = trainingHistoryRows.map((m) => ({
      epoch: m.epoch,
      trainLoss: m.trainLoss ?? 0,
      valLoss: m.valLoss ?? 0,
    }));

    const recentActivity = recentActivities.map((a) => ({
      time: a.timestamp ? new Date(a.timestamp).toLocaleString() : "Unknown",
      action: a.action,
      category: a.category,
      status: "info",
    }));

    return Response.json({
      totalImages: imageCount[0].count,
      annotatedImages: annotatedCount[0].count,
      totalAnnotations: annotationCountResult[0].count,
      duplicates: duplicateCount[0].count,
      classes: classesWithColors,
      qualityDistribution,
      splitDistribution,
      trainingHistory,
      recentActivity,
      datasetCount: datasetCount[0].count,
      bestExperiment: latestExperiment[0] || null,
    });
  } catch (error) {
    console.error("[METRICS] Error:", error);
    return Response.json({
      totalImages: 0,
      annotatedImages: 0,
      totalAnnotations: 0,
      duplicates: 0,
      classes: [],
      qualityDistribution: [],
      splitDistribution: [],
      trainingHistory: [],
      recentActivity: [],
      datasetCount: 0,
      bestExperiment: null,
    });
  }
}
