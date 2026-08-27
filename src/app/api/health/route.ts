export const dynamic = "force-dynamic";

const startTime = Date.now();

export async function GET() {
  return Response.json({
    status: "ok",
    uptime: Math.floor((Date.now() - startTime) / 1000),
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    services: {
      api: "ok",
    },
  });
}
