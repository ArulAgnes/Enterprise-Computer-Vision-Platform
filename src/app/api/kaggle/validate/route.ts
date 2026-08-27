import { NextRequest } from "next/server";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { validateDataset } from "@/lib/kaggle";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { datasetId } = body;

    if (!datasetId) {
      return Response.json({ error: "datasetId is required" }, { status: 400 });
    }

    const result = await validateDataset({ datasetId, db: db as unknown as Record<string, unknown>, schema: schema as unknown as Record<string, unknown> });

    return Response.json(result);
  } catch (error: unknown) {
    const e = error as { message?: string };
    return Response.json(
      { valid: false, errors: [e.message || "Validation failed"], warnings: [], stats: {
        datasetName: "", datasetVersion: "", totalImages: 0, totalAnnotations: 0,
        totalClasses: 0, annotatedImages: 0, unannotatedImages: 0, splits: {},
        qualityFlags: {},
      }},
      { status: 500 }
    );
  }
}
