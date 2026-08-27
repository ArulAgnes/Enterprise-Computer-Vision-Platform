import { NextRequest } from "next/server";
import { publishDataset, checkStatus, datasetExists, getExportDir } from "@/lib/kaggle";
import { db } from "@/db";
import { kagglePublications } from "@/db/schema";
import { eq } from "drizzle-orm";
import path from "path";
import { existsSync } from "fs";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { slug, title, description, datasetId } = body;

    if (!slug || !title) {
      return Response.json({ error: "slug and title are required" }, { status: 400 });
    }

    const status = checkStatus();
    if (!status.authenticated) {
      return Response.json({
        error: "Kaggle not authenticated. Set KAGGLE_API_TOKEN environment variable.",
      }, { status: 401 });
    }

    const exportDir = path.join(process.cwd(), "exports", "kaggle", slug);
    if (!existsSync(exportDir)) {
      return Response.json({ error: "Export package not found. Run export first." }, { status: 404 });
    }

    const isUpdate = datasetExists(status.username!, slug);
    const result = publishDataset(exportDir, slug, title, description || `Dataset: ${title}`, isUpdate);

    if (datasetId) {
      const existing = await db.select().from(kagglePublications)
        .where(eq(kagglePublications.datasetId, datasetId)).limit(1);

      const pubData = {
        datasetId,
        kaggleUsername: status.username,
        kaggleSlug: slug,
        kaggleTitle: title,
        kaggleUrl: result.url || null,
        status: result.success ? "published" : "failed",
        publishedAt: result.success ? new Date() : null,
        lastError: result.error || null,
        exportDir,
      };

      if (existing.length > 0) {
        await db.update(kagglePublications).set({ ...pubData, updatedAt: new Date() })
          .where(eq(kagglePublications.id, existing[0].id));
      } else {
        await db.insert(kagglePublications).values(pubData);
      }
    }

    return Response.json(result);
  } catch (error: unknown) {
    const e = error as { message?: string };
    return Response.json({ error: e.message || "Publish failed", success: false, status: "failed" }, { status: 500 });
  }
}
