import { NextRequest } from "next/server";
import { verifyDataset, checkStatus } from "@/lib/kaggle";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const username = url.searchParams.get("username");
    const slug = url.searchParams.get("slug");

    if (!username || !slug) {
      return Response.json({ error: "username and slug are required" }, { status: 400 });
    }

    const status = checkStatus();
    if (!status.authenticated) {
      return Response.json({ verified: false, error: "Kaggle not authenticated." }, { status: 401 });
    }

    const result = verifyDataset(username, slug);
    return Response.json(result);
  } catch (error: unknown) {
    const e = error as { message?: string };
    return Response.json({ verified: false, error: e.message || "Verification failed" }, { status: 500 });
  }
}
