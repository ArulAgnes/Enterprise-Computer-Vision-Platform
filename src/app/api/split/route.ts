import { NextRequest } from "next/server";
import { db } from "@/db";
import { images, annotations, classes, datasetSplits, datasets } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { datasetId, trainRatio = 0.7, valRatio = 0.15, testRatio = 0.15, seed = 42 } = body;

    if (!datasetId) {
      return Response.json({ error: "datasetId required" }, { status: 400 });
    }

    if (Math.abs(trainRatio + valRatio + testRatio - 1.0) > 0.01) {
      return Response.json({ error: "Ratios must sum to 1.0" }, { status: 400 });
    }

    const datasetImages = await db
      .select()
      .from(images)
      .where(eq(images.datasetId, datasetId));

    if (datasetImages.length === 0) {
      return Response.json({ error: "No images in dataset" }, { status: 400 });
    }

    const shuffled = [...datasetImages];
    let seedState = seed;
    for (let i = shuffled.length - 1; i > 0; i--) {
      seedState = (seedState * 1103515245 + 12345) & 0x7fffffff;
      const j = seedState % (i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const trainCount = Math.floor(shuffled.length * trainRatio);
    const valCount = Math.floor(shuffled.length * valRatio);

    for (let i = 0; i < shuffled.length; i++) {
      let splitType = "test";
      if (i < trainCount) splitType = "train";
      else if (i < trainCount + valCount) splitType = "val";

      await db.update(images)
        .set({ splitType })
        .where(eq(images.id, shuffled[i].id));
    }

    const trainImages = shuffled.slice(0, trainCount);
    const valImages = shuffled.slice(trainCount, trainCount + valCount);
    const testImages = shuffled.slice(trainCount + valCount);

    let leakageDetected = false;
    const leakageDetails: string[] = [];

    const trainHashes = new Set(trainImages.filter(i => i.imageHash).map(i => i.imageHash));
    const testHashes = new Set(testImages.filter(i => i.imageHash).map(i => i.imageHash));
    for (const h of trainHashes) {
      if (testHashes.has(h)) {
        leakageDetected = true;
        leakageDetails.push(`Exact duplicate found between train and test sets (hash: ${h})`);
      }
    }

    const version = `v${Date.now()}`;
    const inserted = await db.insert(datasetSplits).values({
      datasetId,
      version,
      trainRatio,
      valRatio,
      testRatio,
      trainCount: trainCount,
      valCount: valCount,
      testCount: testImages.length,
      randomSeed: seed,
      leakageDetected,
      leakageDetails: leakageDetails.length > 0 ? leakageDetails : null,
    }).returning();

    return Response.json({
      split: inserted[0],
      trainCount,
      valCount,
      testCount: testImages.length,
      total: shuffled.length,
      leakageDetected,
      leakageDetails,
    });
  } catch (error) {
    console.error("[SPLIT] Error:", error);
    return Response.json({ error: "Dataset split failed" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const datasetId = url.searchParams.get("datasetId");

    if (!datasetId) {
      return Response.json({ error: "datasetId required" }, { status: 400 });
    }

    const splits = await db
      .select()
      .from(datasetSplits)
      .where(eq(datasetSplits.datasetId, datasetId));

    return Response.json({ splits, total: splits.length });
  } catch (error) {
    console.error("[SPLIT] GET Error:", error);
    return Response.json({ error: "Failed to fetch splits" }, { status: 500 });
  }
}
