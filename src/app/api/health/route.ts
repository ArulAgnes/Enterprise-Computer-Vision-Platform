import { db } from "@/db";
import { sql } from "drizzle-orm";
import { existsSync, accessSync, writeFileSync, unlinkSync } from "fs";
import path from "path";
import { UPLOADS_DIR, AI_DIR, PYTHON_EXECUTABLE, PYTHON_DIR } from "@/lib/paths";
import { execSync } from "child_process";

export const dynamic = "force-dynamic";

const startTime = Date.now();

export async function GET() {
  // Database check
  let dbStatus = "error";
  let dbDetail = "";
  try {
    await db.select({ one: sql<number>`1` }).from(sql`(SELECT 1) as t`);
    dbStatus = "ok";
    dbDetail = "PostgreSQL connected";
  } catch (e) {
    dbDetail = e instanceof Error ? e.message : "Connection failed";
  }

  // Storage check
  let storageStatus = "error";
  let storageDetail = "";
  try {
    const testFile = path.join(UPLOADS_DIR, ".health_check");
    const dir = path.dirname(testFile);
    if (!existsSync(dir)) {
      storageDetail = "Uploads directory missing";
    } else {
      writeFileSync(testFile, "ok");
      unlinkSync(testFile);
      storageStatus = "ok";
      storageDetail = "Storage available";
    }
  } catch (e) {
    storageDetail = e instanceof Error ? e.message : "Storage check failed";
  }

  // Python check — use bundled Python if available, fall back to system
  let pythonStatus = "error";
  let pythonDetail = "";
  const isBundledPython = existsSync(PYTHON_EXECUTABLE);
  try {
    const pythonCmd = isBundledPython ? `"${PYTHON_EXECUTABLE}"` : (process.platform === "win32" ? "python" : "python3");
    const version = execSync(`${pythonCmd} --version 2>&1`, { timeout: 5000, encoding: "utf-8" }).trim();
    pythonStatus = "ok";
    pythonDetail = isBundledPython ? `${version} (bundled)` : version;
  } catch {
    try {
      const version = execSync("py --version 2>&1", { timeout: 5000, encoding: "utf-8" }).trim();
      pythonStatus = "ok";
      pythonDetail = version;
    } catch (e) {
      pythonDetail = isBundledPython
        ? "Bundled Python found but not working"
        : "Python not found";
    }
  }

  // GPU check
  let gpuStatus = "unavailable";
  let gpuDetail = "CPU training mode";
  try {
    const pythonCmd = isBundledPython ? `"${PYTHON_EXECUTABLE}"` : "python";
    const result = execSync(`${pythonCmd} -c "import torch; print(torch.cuda.is_available())" 2>&1`, { timeout: 10000, encoding: "utf-8" }).trim();
    if (result === "True") {
      gpuStatus = "available";
      gpuDetail = "CUDA GPU available";
    }
  } catch {
    // GPU not available
  }

  // Training entry point check
  let trainingStatus = "unavailable";
  let trainingDetail = "ai/train.py not found";
  try {
    const trainPath = path.join(AI_DIR, "train.py");
    if (existsSync(trainPath)) {
      trainingStatus = "available";
      trainingDetail = "ai/train.py ready";
    }
  } catch {
    // not available
  }

  // Dataset count
  let datasetCount = 0;
  try {
    const result = await db.execute(sql`SELECT count(*)::int as count FROM datasets`);
    datasetCount = ((result as unknown as { rows: { count: number }[] }).rows?.[0]?.count ?? 0) as number;
  } catch {}

  // Image count
  let imageCount = 0;
  try {
    const result = await db.execute(sql`SELECT count(*)::int as count FROM images`);
    imageCount = ((result as unknown as { rows: { count: number }[] }).rows?.[0]?.count ?? 0) as number;
  } catch {}

  const allOk = dbStatus === "ok" && storageStatus === "ok";
  const mode = allOk ? "REAL MODE" : "DEGRADED";

  return Response.json({
    status: allOk ? "ok" : "degraded",
    mode,
    ok: allOk,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    services: {
      database: { status: dbStatus, detail: dbDetail },
      storage: { status: storageStatus, detail: storageDetail },
      python: { status: pythonStatus, detail: pythonDetail },
      gpu: { status: gpuStatus, detail: gpuDetail },
      training: { status: trainingStatus, detail: trainingDetail },
    },
    counts: {
      datasets: datasetCount,
      images: imageCount,
    },
  });
}
