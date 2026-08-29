import { NextRequest } from "next/server";
import { publishNotebook, checkStatus } from "@/lib/kaggle";
import path from "path";
import { existsSync } from "fs";
import { PROJECT_ROOT } from "@/lib/paths";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { slug } = body;

    if (!slug) {
      return Response.json({ error: "slug is required" }, { status: 400 });
    }

    const status = checkStatus();
    if (!status.authenticated) {
      return Response.json({ error: "Kaggle not authenticated." }, { status: 401 });
    }

    const notebookDir = path.join(PROJECT_ROOT, "exports", "kaggle", "notebook");
    if (!existsSync(notebookDir)) {
      return Response.json({ error: "Notebook not generated. Run generate first." }, { status: 404 });
    }

    const result = publishNotebook(notebookDir);
    return Response.json(result);
  } catch (error: unknown) {
    const e = error as { message?: string };
    return Response.json({ success: false, error: e.message || "Notebook publish failed" }, { status: 500 });
  }
}
