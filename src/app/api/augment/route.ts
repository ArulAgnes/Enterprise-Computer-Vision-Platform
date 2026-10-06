/**
 * POST /api/augment — INVENTION 1: Annotation-Aware Synthetic Expansion Engine
 * ============================================================================
 * Body: { datasetVersionId?: string, targetCount?: number, autoSplit?: boolean }
 *
 * Turns 10 hand-annotated photos into 100 diverse, bbox-preserving samples.
 * Every generated image is registered in the `images` table together with:
 *   - its parent image id   (lineage -> group-cohesive, leakage-free splitting)
 *   - sha256 + perceptual hash (dedupe / leakage guards)
 *   - the transformed bounding boxes (annotations stay in sync with the pixels)
 *
 * When `autoSplit` is not disabled the leakage-free auto split (Invention 4)
 * is triggered immediately, with no user click.
 */
import { NextRequest } from "next/server";

import { ANNOTATION_TARGET, DEFAULT_AUGMENT_TARGET, runAugmentation, runAutoSplit } from "@/lib/ai-pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const datasetVersionId: string | null = body.datasetVersionId ?? body.versionId ?? body.datasetId ?? null;
    const targetCount = Number(body.targetCount ?? body.target ?? DEFAULT_AUGMENT_TARGET);
    const autoSplit = body.autoSplit !== false;

    const augmentation = await runAugmentation({ datasetVersionId, targetCount });

    if (augmentation.status === "need_annotation") {
      return Response.json(
        {
          error: `Need at least ${ANNOTATION_TARGET} annotated images to run the synthetic expansion engine`,
          need_annotation: true,
          annotated: augmentation.annotatedCount ?? 0,
          required: ANNOTATION_TARGET,
          message: "Annotate 10 images, then this dialog will unlock 100 bbox-preserving samples.",
        },
        { status: 400 }
      );
    }

    if (augmentation.status === "error") {
      return Response.json(
        { error: augmentation.error || "Synthetic expansion failed", logs: augmentation.logs },
        { status: 500 }
      );
    }

    // -------- INVENTION 4 runs automatically right after expansion --------
    let split: Awaited<ReturnType<typeof runAutoSplit>> | null = null;
    if (autoSplit) {
      split = await runAutoSplit({ datasetVersionId });
    }

    return Response.json({
      status: "ready",
      original: augmentation.original,
      augmented: augmentation.generated,
      total: augmentation.total,
      target: augmentation.requested,
      engine: augmentation.engine,
      rejected: augmentation.rejected,
      duplicates: augmentation.duplicates,
      per_class: augmentation.per_class,
      preview: augmentation.preview,
      images: augmentation.images.slice(0, 12),
      jsonPath: augmentation.jsonPath,
      logs: augmentation.logs.slice(-60),
      auto_split: split
        ? {
            train: split.train,
            val: split.val,
            test: split.test,
            leakage: split.leakage,
            stratified: split.stratified,
            version_id: split.versionId,
            version: split.version,
            method: split.method,
            attempts: split.attempts,
            files: split.files,
            class_distribution: split.classDistribution,
            error: split.error,
          }
        : null,
      invention: "Annotation-Aware Synthetic Expansion Engine",
    });
  } catch (error) {
    console.error("[AUGMENT] Error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Synthetic expansion failed" },
      { status: 500 }
    );
  }
}

/** GET /api/augment — report the current expansion readiness. */
export async function GET() {
  try {
    const { resolveVersion, countAnnotated, modelArtifacts } = await import("@/lib/ai-pipeline");
    const { datasetId } = await resolveVersion(null);
    const counts = await countAnnotated(datasetId);
    return Response.json({
      datasetId,
      annotated: counts.annotated,
      total: counts.total,
      required: ANNOTATION_TARGET,
      ready: counts.annotated >= ANNOTATION_TARGET,
      defaultTarget: DEFAULT_AUGMENT_TARGET,
      artifacts: modelArtifacts(),
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "failed" }, { status: 500 });
  }
}
