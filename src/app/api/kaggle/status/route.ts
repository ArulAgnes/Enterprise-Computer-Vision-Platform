import { checkStatus, testAuth } from "@/lib/kaggle";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const status = checkStatus();

    if (status.configured && status.authenticated) {
      const authOk = await testAuth();
      if (!authOk) {
        return Response.json({
          configured: true,
          authenticated: false,
          username: null,
          status: "auth_failed",
          error: "Kaggle authentication failed. Check KAGGLE_API_TOKEN.",
        });
      }
    }

    return Response.json(status);
  } catch (error: unknown) {
    const e = error as { message?: string };
    return Response.json({
      configured: false,
      authenticated: false,
      username: null,
      status: "error",
      error: e.message || "Failed to check Kaggle status.",
    });
  }
}
