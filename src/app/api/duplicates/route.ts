import { NextRequest } from "next/server";
import { db } from "@/db";
import { images, duplicateGroups, datasets } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { resolveDatasetIdentifier } from "@/lib/dataset";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { datasetId: datasetIdRaw, threshold = 5 } = body;

    if (!datasetIdRaw) {
      return Response.json({ error: "datasetId required" }, { status: 400 });
    }

    const ds = await resolveDatasetIdentifier(datasetIdRaw);
    if (!ds) {
      return Response.json({ error: "Dataset not found" }, { status: 404 });
    }

    const datasetImages = await db
      .select()
      .from(images)
      .where(eq(images.datasetId, ds.id));

    if (datasetImages.length < 2) {
      return Response.json({
        message: "Need at least 2 images for duplicate detection",
        exactGroups: 0,
        nearGroups: 0,
      });
    }

    const exactGroups: Array<{ images: string[]; hash: string }> = [];
    const hashMap = new Map<string, string[]>();
    for (const img of datasetImages) {
      if (img.imageHash) {
        const existing = hashMap.get(img.imageHash) || [];
        existing.push(img.id);
        hashMap.set(img.imageHash, existing);
      }
    }
    for (const [hash, ids] of hashMap) {
      if (ids.length > 1) {
        exactGroups.push({ images: ids, hash });
      }
    }

    const nearGroups: Array<{ images: string[]; similarity: number }> = [];
    const pHashMap = new Map<string, string[]>();
    for (const img of datasetImages) {
      if (img.perceptualHash) {
        const existing = pHashMap.get(img.perceptualHash) || [];
        existing.push(img.id);
        pHashMap.set(img.perceptualHash, existing);
      }
    }

    for (const [_, ids] of pHashMap) {
      if (ids.length > 1) {
        nearGroups.push({ images: ids, similarity: 100 });
      }
    }

    // Clear existing groups for this dataset first
    await db.delete(duplicateGroups).where(eq(duplicateGroups.datasetId, ds.id));

    for (const group of exactGroups) {
      await db.insert(duplicateGroups).values({
        datasetId: ds.id,
        groupType: "exact",
        similarityScore: 100,
        imageIds: group.images,
      });
    }

    for (const group of nearGroups) {
      await db.insert(duplicateGroups).values({
        datasetId: ds.id,
        groupType: "near",
        similarityScore: group.similarity,
        imageIds: group.images,
      });
    }

    return Response.json({
      totalImages: datasetImages.length,
      exactGroups: exactGroups.length,
      nearGroups: nearGroups.length,
      exactDuplicateImages: exactGroups.reduce((sum, g) => sum + g.images.length, 0),
      nearDuplicateImages: nearGroups.reduce((sum, g) => sum + g.images.length, 0),
      groups: [...exactGroups.map(g => ({ ...g, type: "exact" })), ...nearGroups.map(g => ({ ...g, type: "near" }))],
    });
  } catch (error) {
    console.error("[DUPLICATES] Error:", error);
    return Response.json({ error: "Duplicate detection failed" }, { status: 500 });
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

    const groups = await db
      .select()
      .from(duplicateGroups)
      .where(eq(duplicateGroups.datasetId, ds.id));

    return Response.json({ groups, total: groups.length });
  } catch (error) {
    console.error("[DUPLICATES] GET Error:", error);
    return Response.json({ error: "Failed to fetch duplicates" }, { status: 500 });
  }
}
