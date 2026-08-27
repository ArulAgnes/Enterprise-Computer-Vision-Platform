import { db } from "@/db";
import { images, classes, annotations, qualityReports, datasetSplits, datasetVersions, experiments, models, evaluations, kagglePublications, datasets } from "@/db/schema";
import { sql, eq, count, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [imageCount, classCount, annotationCount, annotatedCount, qualityCount, splitCount, versionCount, experimentCount, modelCount, evaluationCount, kaggleCount, notebookCount] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(images),
      db.select({ count: sql<number>`count(*)::int` }).from(classes),
      db.select({ count: sql<number>`count(*)::int` }).from(annotations),
      db.select({ count: sql<number>`count(*)::int` }).from(images).where(eq(images.annotationStatus, "annotated")),
      db.select({ count: sql<number>`count(*)::int` }).from(qualityReports),
      db.select({ count: sql<number>`count(*)::int` }).from(datasetSplits),
      db.select({ count: sql<number>`count(*)::int` }).from(datasetVersions),
      db.select({ count: sql<number>`count(*)::int` }).from(experiments),
      db.select({ count: sql<number>`count(*)::int` }).from(models).where(eq(models.status, "trained")),
      db.select({ count: sql<number>`count(*)::int` }).from(evaluations),
      db.select({ count: sql<number>`count(*)::int` }).from(kagglePublications).where(eq(kagglePublications.status, "published")),
      db.select({ count: sql<number>`count(*)::int` }).from(kagglePublications).where(eq(kagglePublications.notebookStatus, "published")),
    ]);

    const totalImages = imageCount[0].count;
    const totalClasses = classCount[0].count;
    const totalAnnotations = annotationCount[0].count;
    const annotatedImages = annotatedCount[0].count;
    const unannotatedImages = totalImages - annotatedImages;

    const hasQualityReports = qualityCount[0].count > 0;
    const hasSplits = splitCount[0].count > 0;
    const hasVersions = versionCount[0].count > 0;
    const hasExperiments = experimentCount[0].count > 0;
    const hasTrainedModel = modelCount[0].count > 0;
    const hasEvaluations = evaluationCount[0].count > 0;
    const hasKagglePublication = kaggleCount[0].count > 0;
    const hasNotebook = notebookCount[0].count > 0;

    // Determine current step
    const completedSteps: number[] = [];
    if (totalImages > 0) completedSteps.push(1);
    if (totalImages > 0) completedSteps.push(2);
    if (totalClasses > 0) completedSteps.push(3);
    if (annotatedImages > 0 && annotatedImages >= totalImages) completedSteps.push(4);
    if (hasQualityReports) completedSteps.push(5);
    if (hasQualityReports) completedSteps.push(6);
    if (hasSplits) completedSteps.push(7);
    if (hasVersions) completedSteps.push(8);
    if (hasExperiments) completedSteps.push(9);
    if (hasEvaluations) completedSteps.push(10);
    if (hasEvaluations) completedSteps.push(11);
    if (hasKagglePublication) completedSteps.push(12);
    if (hasKagglePublication) completedSteps.push(13);
    if (hasNotebook) completedSteps.push(14);
    if (hasNotebook) completedSteps.push(15);

    let currentStep = 1;
    for (let i = 1; i <= 15; i++) {
      if (!completedSteps.includes(i)) {
        currentStep = i;
        break;
      }
      if (i === 15) currentStep = 15;
    }

    return Response.json({
      currentStep,
      completedSteps,
      totalImages,
      totalClasses,
      totalAnnotations,
      annotatedImages,
      unannotatedImages,
      hasQualityReports,
      hasSplits,
      hasVersions,
      hasExperiments,
      hasTrainedModel,
      hasEvaluations,
      hasKagglePublication,
      hasNotebook,
    });
  } catch (error) {
    console.error("[WORKFLOW-STATE] Error:", error);
    return Response.json({
      currentStep: 1,
      completedSteps: [],
      totalImages: 0,
      totalClasses: 0,
      totalAnnotations: 0,
      annotatedImages: 0,
      unannotatedImages: 0,
      hasQualityReports: false,
      hasSplits: false,
      hasVersions: false,
      hasExperiments: false,
      hasTrainedModel: false,
      hasEvaluations: false,
      hasKagglePublication: false,
      hasNotebook: false,
    });
  }
}
