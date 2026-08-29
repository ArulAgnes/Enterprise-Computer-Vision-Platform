import { db } from "@/db";
import { images, classes, annotations, qualityReports, datasetSplits, datasetVersions, experiments, models, evaluations, kagglePublications, datasets } from "@/db/schema";
import { sql, eq } from "drizzle-orm";
import { resolveDatasetIdentifier } from "@/lib/dataset";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const datasetIdParam = url.searchParams.get("datasetId");

    let datasetFilter = undefined;
    let resolvedDataset = null;
    if (datasetIdParam) {
      resolvedDataset = await resolveDatasetIdentifier(datasetIdParam);
      if (resolvedDataset) {
        datasetFilter = eq(images.datasetId, resolvedDataset.id);
      }
    }

    const qFilter = datasetFilter || undefined;

    const [
      imageCountResult,
      annotatedCountResult,
      classCountResult,
      annotationCountResult,
      qualityCountResult,
      greenQualityResult,
      splitCountResult,
      versionCountResult,
      experimentCountResult,
      modelCountResult,
      evaluationCountResult,
      kaggleCountResult,
      notebookCountResult,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(images).where(qFilter),
      db.select({ count: sql<number>`count(*)::int` }).from(images).where(datasetFilter ? sql`${images.annotationStatus} = 'annotated' AND ${images.datasetId} = ${resolvedDataset!.id}` : eq(images.annotationStatus, "annotated")),
      db.select({ count: sql<number>`count(*)::int` }).from(classes).where(datasetFilter ? eq(classes.datasetId, resolvedDataset!.id) : undefined),
      db.select({ count: sql<number>`count(*)::int` }).from(annotations).where(datasetFilter ? eq(annotations.datasetId, resolvedDataset!.id) : undefined),
      db.select({ count: sql<number>`count(*)::int` }).from(qualityReports).where(datasetFilter ? eq(qualityReports.datasetId, resolvedDataset!.id) : undefined),
      db.select({ count: sql<number>`count(*)::int` }).from(qualityReports).where(datasetFilter ? sql`${qualityReports.datasetId} = ${resolvedDataset!.id} AND ${qualityReports.qualityFlag} = 'green'` : sql`${qualityReports.qualityFlag} = 'green'`),
      db.select({ count: sql<number>`count(*)::int` }).from(datasetSplits).where(datasetFilter ? eq(datasetSplits.datasetId, resolvedDataset!.id) : undefined),
      db.select({ count: sql<number>`count(*)::int` }).from(datasetVersions).where(datasetFilter ? eq(datasetVersions.datasetId, resolvedDataset!.id) : undefined),
      db.select({ count: sql<number>`count(*)::int` }).from(experiments).where(datasetFilter ? eq(experiments.datasetId, resolvedDataset!.id) : undefined),
      db.select({ count: sql<number>`count(*)::int` }).from(models).where(datasetFilter ? sql`${models.datasetId} = ${resolvedDataset!.id} AND ${models.status} = 'trained'` : eq(models.status, "trained")),
      db.select({ count: sql<number>`count(*)::int` }).from(evaluations).where(datasetFilter ? eq(evaluations.datasetId, resolvedDataset!.id) : undefined),
      db.select({ count: sql<number>`count(*)::int` }).from(kagglePublications).where(datasetFilter ? sql`${kagglePublications.datasetId} = ${resolvedDataset!.id} AND ${kagglePublications.status} = 'published'` : eq(kagglePublications.status, "published")),
      db.select({ count: sql<number>`count(*)::int` }).from(kagglePublications).where(datasetFilter ? sql`${kagglePublications.datasetId} = ${resolvedDataset!.id} AND ${kagglePublications.notebookStatus} = 'published'` : eq(kagglePublications.notebookStatus, "published")),
    ]);

    const totalImages = imageCountResult[0].count;
    const totalClasses = classCountResult[0].count;
    const totalAnnotations = annotationCountResult[0].count;
    const annotatedImages = annotatedCountResult[0].count;
    const unannotatedImages = totalImages - annotatedImages;

    const qualityReportCount = qualityCountResult[0].count;
    const greenQualityCount = greenQualityResult[0].count;
    const hasQualityReports = qualityReportCount > 0;
    const qualityComplete = hasQualityReports && qualityReportCount >= totalImages;
    const allQualityGreen = hasQualityReports && greenQualityCount >= totalImages;

    const hasSplits = splitCountResult[0].count > 0;
    const hasVersions = versionCountResult[0].count > 0;
    const hasExperiments = experimentCountResult[0].count > 0;
    const hasTrainedModel = modelCountResult[0].count > 0;
    const hasEvaluations = evaluationCountResult[0].count > 0;
    const hasKagglePublication = kaggleCountResult[0].count > 0;
    const hasNotebook = notebookCountResult[0].count > 0;

    const annotationComplete = totalImages > 0 && annotatedImages >= totalImages;

    const completedSteps: number[] = [];
    if (totalImages > 0) completedSteps.push(1);
    if (totalImages > 0) completedSteps.push(2);
    if (totalClasses > 0) completedSteps.push(3);
    if (annotationComplete) completedSteps.push(4);
    if (qualityComplete) completedSteps.push(5);
    if (qualityComplete) completedSteps.push(6);
    if (hasSplits) completedSteps.push(7);
    if (hasVersions) completedSteps.push(8);
    if (hasTrainedModel) completedSteps.push(9);
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

    const blockers: string[] = [];
    if (!annotationComplete && totalImages > 0) {
      blockers.push(`${unannotatedImages} of ${totalImages} images still require annotation`);
    }
    if (annotationComplete && !qualityComplete) {
      blockers.push(`${totalImages - qualityReportCount} images not yet quality-analyzed`);
    }
    if (qualityComplete && !hasSplits) {
      blockers.push("Dataset split not yet created");
    }
    if (hasSplits && !hasVersions) {
      blockers.push("Dataset version not yet created");
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
      qualityReportCount,
      qualityComplete,
      allQualityGreen,
      hasSplits,
      hasVersions,
      hasExperiments,
      hasTrainedModel,
      hasEvaluations,
      hasKagglePublication,
      hasNotebook,
      annotationComplete,
      blockers,
      datasetId: resolvedDataset?.id || null,
      datasetPublicId: resolvedDataset?.datasetId || null,
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
      qualityReportCount: 0,
      qualityComplete: false,
      allQualityGreen: false,
      hasSplits: false,
      hasVersions: false,
      hasExperiments: false,
      hasTrainedModel: false,
      hasEvaluations: false,
      hasKagglePublication: false,
      hasNotebook: false,
      annotationComplete: false,
      blockers: [],
      datasetId: null,
      datasetPublicId: null,
    });
  }
}
