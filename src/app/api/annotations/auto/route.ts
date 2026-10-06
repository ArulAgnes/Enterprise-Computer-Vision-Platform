/**
 * POST /api/annotations/auto — annotation accelerator
 * ===================================================
 * Body: { datasetId?, perClass?, limit?, minConfidence?, source? }
 *
 * Proposes bounding boxes with the classical-CV engine (`ai/auto_annotate.py`:
 * Lab colour-distance saliency + HSV saturation + centre bias + Otsu + contours)
 * and stores them as *editable* annotations. No pretrained model is involved —
 * fully compliant with the from-scratch rule.
 *
 * The Annotation Studio can then refine every proposed box.
 */
import { NextRequest } from "next/server";

import { autoAnnotateImages, countAnnotated, ensureClasses, getOrCreateDataset } from "@/lib/ai-pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const dataset = await getOrCreateDataset();
    const classList = await ensureClasses(dataset.id);

    const result = await autoAnnotateImages(dataset.id, {
      perClass: body.perClass ? Number(body.perClass) : undefined,
      limit: body.limit ? Number(body.limit) : undefined,
      minConfidence: body.minConfidence !== undefined ? Number(body.minConfidence) : 0.4,
      imagesRoot: body.source || undefined,
    });

    const counts = await countAnnotated(dataset.id);

    if (!result.ok) {
      return Response.json(
        {
          error: result.error || "No boxes could be proposed",
          inserted: 0,
          proposed: result.proposed,
          annotated: counts.annotated,
          logs: result.logs.slice(-30),
        },
        { status: 400 }
      );
    }

    return Response.json({
      success: true,
      datasetId: dataset.id,
      classes: classList,
      proposed: result.proposed,
      inserted: result.inserted,
      per_class: result.perClass,
      engine: result.engine,
      annotated: counts.annotated,
      total: counts.total,
      proposals: result.proposals,
      logs: result.logs.slice(-30),
      note: "Boxes are proposals from classical CV — open /annotation to refine them before training.",
    });
  } catch (error) {
    console.error("[ANNOTATIONS/AUTO] Error:", error);
    return Response.json({ error: error instanceof Error ? error.message : "Auto annotation failed" }, { status: 500 });
  }
}

export async function GET() {
  const dataset = await getOrCreateDataset();
  const counts = await countAnnotated(dataset.id);
  return Response.json({
    datasetId: dataset.id,
    annotated: counts.annotated,
    total: counts.total,
    engine: "Lab colour-distance saliency + HSV saturation + centre bias + Otsu (classical CV, no pretrained model)",
  });
}
