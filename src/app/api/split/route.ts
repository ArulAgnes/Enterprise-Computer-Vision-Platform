/**
 * /api/split — INVENTION 4: Data-First Quality Gate with Leakage-Free Auto Split
 * ==============================================================================
 * POST body:
 *   { datasetVersionId?: string, ratios?: {train,val,test}, seed?: number }
 *
 * Guarantees (see ai/split_helper.py):
 *   1. Group cohesion — a parent photo and all of its synthetic children always
 *      land in the SAME split (the leakage every naive pipeline ships with).
 *   2. Perceptual-hash guard — every test image must be >= 8 Hamming bits away
 *      from every train image (resampled up to 20 times, seeded).
 *   3. Exact-hash guard — identical sha256 digests can never straddle splits.
 *   4. Class-stratified via scikit-learn StratifiedShuffleSplit (seed 42).
 *
 * Writes dataset/split.json + train/val/test_split.json for the trainer and
 * returns real counts (e.g. 77 / 16 / 17 with leakage PASSED).
 */
import { NextRequest } from "next/server";

import { runAutoSplit } from "@/lib/ai-pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const datasetVersionId: string | null = body.datasetVersionId ?? body.versionId ?? body.datasetId ?? null;
    const ratios = body.ratios ?? { train: body.trainRatio ?? 0.7, val: body.valRatio ?? 0.15, test: body.testRatio ?? 0.15 };
    const seed = Number(body.seed ?? 42);

    const result = await runAutoSplit({ datasetVersionId, ratios, seed });

    if (result.status !== "ok") {
      return Response.json(
        { error: result.error || "Auto split failed", logs: result.logs.slice(-40) },
        { status: 400 }
      );
    }

    return Response.json({
      status: "ok",
      version_id: result.versionId,
      version: result.version,
      train: result.train,
      val: result.val,
      test: result.test,
      total: result.total,
      leakage: result.leakage,
      leakage_detected: result.leakageDetected,
      stratified: result.stratified,
      attempts: result.attempts,
      method: result.method,
      groups: result.groups,
      class_distribution: result.classDistribution,
      files: result.files,
      datasetVersionId: result.versionId,
      logs: result.logs.slice(-40),
      invention: "Leakage-Free Stratified Auto Split",
    });
  } catch (error) {
    console.error("[SPLIT] Error:", error);
    return Response.json({ error: error instanceof Error ? error.message : "Auto split failed" }, { status: 500 });
  }
}

/** GET /api/split — latest recorded splits. */
export async function GET() {
  try {
    const { db } = await import("@/db");
    const { datasetSplits } = await import("@/db/schema");
    const { desc } = await import("drizzle-orm");
    const splits = await db.select().from(datasetSplits).orderBy(desc(datasetSplits.createdAt)).limit(10);
    const latest = splits[0] ?? null;
    const details = (latest?.leakageDetails ?? null) as Record<string, unknown> | null;

    return Response.json({
      splits,
      total: splits.length,
      // Flat summary so the training page can render the auto-split banner
      // without digging into the raw rows.
      status: latest ? "ok" : "empty",
      version: latest?.version ?? null,
      version_id: latest?.id ?? null,
      train: latest?.trainCount ?? 0,
      val: latest?.valCount ?? 0,
      test: latest?.testCount ?? 0,
      leakage: latest ? (latest.leakageDetected ? "FAILED" : "PASSED") : "UNKNOWN",
      leakage_detected: latest?.leakageDetected ?? false,
      stratified: Boolean(details?.stratified ?? true),
      attempts: (details?.attempts as number) ?? null,
      method: (details?.method as string) ?? null,
      groups: (details?.groups as number) ?? null,
      seed: latest?.randomSeed ?? 42,
    });
  } catch (error) {
    console.error("[SPLIT] GET Error:", error);
    return Response.json({ error: "Failed to fetch splits" }, { status: 500 });
  }
}
