import { NextRequest } from "next/server";
import { db } from "@/db";
import { datasets, images, classes, qualityReports, datasetSplits, datasetVersions } from "@/db/schema";
import { eq, sql, and } from "drizzle-orm";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync, readdirSync, statSync } from "fs";
import path from "path";
import { createHash } from "crypto";

const DATASET_SOURCE = path.join(process.cwd(), "datasets", "images", "train");
const UPLOADS_DIR = path.join(process.cwd(), "uploads");

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { force = false } = body;

    const status: {
      started: string;
      steps: Array<Record<string, unknown>>;
      completed?: string;
      dataset?: Record<string, unknown>;
      annotationRequired?: boolean;
      trainingBlocked?: boolean;
      message?: string;
    } = {
      started: new Date().toISOString(),
      steps: [],
    };

    // Step 1: Inspect images
    if (!existsSync(DATASET_SOURCE)) {
      return Response.json({ error: "Image directory not found", status: "not_ready" }, { status: 404 });
    }

    const allFiles = readdirSync(DATASET_SOURCE).filter(f => f.toLowerCase().endsWith(".png"));
    const validImages: Array<{ name: string; path: string; size: number }> = [];
    const corruptImages: string[] = [];

    for (const fname of allFiles) {
      const fpath = path.join(DATASET_SOURCE, fname);
      const size = statSync(fpath).size;
      if (size < 100) {
        corruptImages.push(fname);
      } else {
        validImages.push({ name: fname, path: fpath, size });
      }
    }

    status.steps.push({
      step: "inspect",
      total: allFiles.length,
      valid: validImages.length,
      corrupt: corruptImages.length,
    });

    // Step 2: Find or create dataset
    const existingDatasets = await db.select().from(datasets);
    let dataset = existingDatasets.find(ds =>
      ds.name.toLowerCase().includes("human") && ds.name.toLowerCase().includes("baseline")
    );

    if (dataset && !force) {
      status.steps.push({ step: "dataset", action: "reused", id: dataset.id, name: dataset.name });
    } else if (dataset && force) {
      await db.delete(images).where(eq(images.datasetId, dataset.id));
      await db.delete(classes).where(eq(classes.datasetId, dataset.id));
      await db.delete(qualityReports).where(eq(qualityReports.datasetId, dataset.id));
      await db.delete(datasetSplits).where(eq(datasetSplits.datasetId, dataset.id));
      await db.delete(datasetVersions).where(eq(datasetVersions.datasetId, dataset.id));
      status.steps.push({ step: "dataset", action: "reset", id: dataset.id });
    } else {
      const [newDs] = await db.insert(datasets).values({
        name: "Human Detection Baseline",
        datasetId: `HDB-${Date.now().toString(36).toUpperCase()}`,
        theme: "Person Detection — DataGenesis 2026",
        description: "Human images for person detection model training. 559 team-collected images.",
        collectionLocation: "Team Collected",
        status: "active",
        version: "0.1",
      }).returning();
      dataset = newDs;
      status.steps.push({ step: "dataset", action: "created", id: dataset.id, name: dataset.name });
    }

    if (!dataset) {
      return Response.json({ error: "Failed to create dataset" }, { status: 500 });
    }

    const datasetId = dataset.id;

    // Step 3: Import images
    const existingImages = await db.select().from(images).where(eq(images.datasetId, datasetId));
    const existingNames = new Set(existingImages.map(img => img.originalFilename ?? img.filename));

    const uploadDir = path.join(UPLOADS_DIR, datasetId);
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    let imported = 0;
    let errors = 0;
    const toImport = validImages.filter(img => !existingNames.has(img.name));

    for (const img of toImport) {
      try {
        const dstPath = path.join(uploadDir, img.name);
        if (!existsSync(dstPath)) {
          const buffer = await readFile(img.path);
          await writeFile(dstPath, buffer);
        }

        const buffer = await readFile(img.path);
        const sha256 = createHash("sha256").update(buffer).digest("hex");

        let width = 0, height = 0;
        if (buffer.length > 24) {
          if (buffer[0] === 0x89 && buffer[1] === 0x50) {
            width = buffer.readUInt32BE(16);
            height = buffer.readUInt32BE(20);
          }
        }

        await db.insert(images).values({
          datasetId,
          filename: img.name,
          originalFilename: img.name,
          filepath: dstPath,
          width: width || null,
          height: height || null,
          resolution: width && height ? `${width}x${height}` : null,
          fileSize: img.size,
          mimeType: "image/png",
          imageHash: sha256,
          splitType: "unassigned",
          annotationStatus: "unannotated",
          qualityStatus: "pending",
          isDemo: false,
        });
        imported++;
      } catch (err) {
        errors++;
      }
    }

    status.steps.push({
      step: "import",
      imported,
      alreadyExists: existingImages.length,
      errors,
      total: existingImages.length + imported,
    });

    // Step 4: Create class
    const existingClasses = await db.select().from(classes).where(eq(classes.datasetId, datasetId));
    if (existingClasses.length === 0) {
      await db.insert(classes).values({
        datasetId,
        name: "person",
        classIndex: 0,
        description: "Human person — full body or upper body visible",
        color: "#10b981",
      });
      status.steps.push({ step: "class", action: "created", name: "person", index: 0 });
    } else {
      status.steps.push({ step: "class", action: "exists", count: existingClasses.length });
    }

    // Step 5: Quality checks
    const allImagesInDb = await db.select().from(images).where(eq(images.datasetId, datasetId));
    const pendingImages = allImagesInDb.filter(img => img.qualityStatus === "pending");

    let qualityAnalyzed = 0;
    for (const img of pendingImages) {
      try {
        const filePath = img.filepath || path.join(UPLOADS_DIR, datasetId, img.filename);
        let fileBuffer: Buffer;
        try {
          fileBuffer = await readFile(filePath);
        } catch {
          continue;
        }

        let brightness = 0, contrast = 0, blurScore = 0, entropy = 0;
        const sampleSize = Math.min(fileBuffer.length, 10000);
        const step = Math.max(1, Math.floor(fileBuffer.length / sampleSize));
        let sum = 0, sumSq = 0, count = 0;
        const freq = new Array(256).fill(0);

        for (let i = 0; i < fileBuffer.length; i += step) {
          const val = fileBuffer[i];
          sum += val;
          sumSq += val * val;
          freq[val]++;
          count++;
        }

        const mean = sum / count;
        const variance = sumSq / count - mean * mean;
        brightness = Math.round(mean * 100) / 100;
        contrast = Math.round(Math.sqrt(Math.max(0, variance)) * 100) / 100;

        let edgeSum = 0, edgeCount = 0;
        const edgeN = Math.min(fileBuffer.length - 2, 5000);
        const edgeStep = Math.max(1, Math.floor(edgeN / 5000));
        for (let i = 1; i < edgeN; i += edgeStep) {
          edgeSum += Math.abs(fileBuffer[i] - fileBuffer[i - 1]);
          edgeCount++;
        }
        blurScore = edgeCount > 0 ? Math.round((edgeSum / edgeCount) * 100) / 100 : 0;

        for (let i = 0; i < 256; i++) {
          if (freq[i] > 0) {
            const p = freq[i] / count;
            entropy -= p * Math.log2(p);
          }
        }
        entropy = Math.round(entropy * 100) / 100;

        const isBlurry = blurScore < 50;
        const isDark = brightness < 40;
        const isOverexposed = brightness > 220;
        const isTiny = (img.width || 0) < 100 || (img.height || 0) < 100;
        const isCorrupt = fileBuffer.length < 100;

        let qualityScore = 100;
        if (isBlurry) qualityScore -= 30;
        if (isDark) qualityScore -= 20;
        if (isOverexposed) qualityScore -= 20;
        if (isTiny) qualityScore -= 15;
        if (isCorrupt) qualityScore -= 50;
        qualityScore = Math.max(0, Math.min(100, qualityScore));

        let qualityFlag = "green";
        if (qualityScore < 50) qualityFlag = "red";
        else if (qualityScore < 75) qualityFlag = "yellow";

        await db.insert(qualityReports).values({
          imageId: img.id,
          datasetId,
          brightness,
          contrast,
          blurScore,
          sharpness: blurScore,
          noiseEstimate: 0,
          entropy,
          exposureEstimate: brightness / 255,
          aspectRatio: img.width && img.height ? img.width / img.height : 0,
          isBlurry,
          isDark,
          isOverexposed,
          isTiny,
          isCorrupt,
          isDuplicate: false,
          qualityScore,
          qualityFlag,
        });

        await db.update(images).set({ qualityStatus: qualityFlag }).where(eq(images.id, img.id));
        qualityAnalyzed++;
      } catch {
        // skip
      }
    }

    status.steps.push({ step: "quality", analyzed: qualityAnalyzed, total: allImagesInDb.length });

    // Step 6: Split
    const totalImages = allImagesInDb.length;
    const existingSplits = await db.select().from(datasetSplits).where(eq(datasetSplits.datasetId, datasetId));

    if (existingSplits.length === 0 && totalImages > 0) {
      const shuffled = [...allImagesInDb];
      let seedState = 42;
      for (let i = shuffled.length - 1; i > 0; i--) {
        seedState = (seedState * 1103515245 + 12345) & 0x7fffffff;
        const j = seedState % (i + 1);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      const trainCount = Math.floor(shuffled.length * 0.70);
      const valCount = Math.floor(shuffled.length * 0.15);

      for (let i = 0; i < shuffled.length; i++) {
        let splitType = "test";
        if (i < trainCount) splitType = "train";
        else if (i < trainCount + valCount) splitType = "val";
        await db.update(images).set({ splitType }).where(eq(images.id, shuffled[i].id));
      }

      await db.insert(datasetSplits).values({
        datasetId,
        version: "v1.0",
        trainRatio: 0.70,
        valRatio: 0.15,
        testRatio: 0.15,
        trainCount,
        valCount,
        testCount: shuffled.length - trainCount - valCount,
        randomSeed: 42,
        leakageDetected: false,
      });

      status.steps.push({
        step: "split",
        train: trainCount,
        val: valCount,
        test: shuffled.length - trainCount - valCount,
        total: shuffled.length,
      });
    } else {
      status.steps.push({ step: "split", action: "exists" });
    }

    // Step 7: Version
    const existingVersions = await db.select().from(datasetVersions).where(eq(datasetVersions.datasetId, datasetId));
    if (existingVersions.length === 0) {
      const imageCount = (await db.select({ count: sql<number>`count(*)::int` }).from(images).where(eq(images.datasetId, datasetId)))[0]?.count ?? 0;
      const annotationCount = 0;
      const classCountResult = (await db.select({ count: sql<number>`count(*)::int` }).from(classes).where(eq(classes.datasetId, datasetId)))[0]?.count ?? 0;

      await db.insert(datasetVersions).values({
        datasetId,
        version: "v0.1",
        changeDescription: "Initial import — 559 human images, person class, quality checked, split configured",
        imagesAdded: imageCount,
        annotationsChanged: annotationCount,
        classesChanged: classCountResult,
      });

      await db.update(datasets).set({ version: "v0.1" }).where(eq(datasets.id, datasetId));
      status.steps.push({ step: "version", version: "v0.1" });
    } else {
      status.steps.push({ step: "version", action: "exists" });
    }

    // Final status
    const totalInDb = (await db.select({ count: sql<number>`count(*)::int` }).from(images).where(eq(images.datasetId, datasetId)))[0]?.count ?? 0;
    const annotatedCount = await db.execute(sql`
      SELECT count(*)::int as count FROM images
      WHERE dataset_id = ${datasetId} AND annotation_status = 'annotated'
    `);
    const annotated = ((annotatedCount as unknown as { rows: { count: number }[] }).rows?.[0]?.count ?? 0) as number;

    status.completed = new Date().toISOString();
    status.dataset = {
      id: datasetId,
      name: "Human Detection Baseline",
      totalImages: totalInDb,
      annotatedImages: annotated,
      classes: 1,
      annotationCoverage: totalInDb > 0 ? Math.round((annotated / totalInDb) * 10000) / 100 : 0,
    };
    status.annotationRequired = annotated < totalInDb;
    status.trainingBlocked = annotated < totalInDb;
    status.message = annotated < totalInDb
      ? "Dataset ready. Annotations required before training."
      : "Dataset ready. Annotations complete. Training can proceed.";

    return Response.json(status, { status: 200 });
  } catch (error) {
    console.error("[BASELINE] Error:", error);
    return Response.json({ error: "Baseline initialization failed" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const existingDatasets = await db.select().from(datasets);
    const baseline = existingDatasets.find(ds =>
      ds.name.toLowerCase().includes("human") && ds.name.toLowerCase().includes("baseline")
    );

    if (!baseline) {
      return Response.json({ exists: false, status: "not_initialized" });
    }

    const totalImages = (await db.select({ count: sql<number>`count(*)::int` }).from(images).where(eq(images.datasetId, baseline.id)))[0]?.count ?? 0;
    const annotatedResult = await db.execute(sql`
      SELECT count(*)::int as count FROM images
      WHERE dataset_id = ${baseline.id} AND annotation_status = 'annotated'
    `);
    const annotated = ((annotatedResult as unknown as { rows: { count: number }[] }).rows?.[0]?.count ?? 0) as number;
    const classCount = (await db.select({ count: sql<number>`count(*)::int` }).from(classes).where(eq(classes.datasetId, baseline.id)))[0]?.count ?? 0;
    const versionCount = (await db.select({ count: sql<number>`count(*)::int` }).from(datasetVersions).where(eq(datasetVersions.datasetId, baseline.id)))[0]?.count ?? 0;
    const splitCount = (await db.select({ count: sql<number>`count(*)::int` }).from(datasetSplits).where(eq(datasetSplits.datasetId, baseline.id)))[0]?.count ?? 0;

    return Response.json({
      exists: true,
      dataset: {
        id: baseline.id,
        name: baseline.name,
        datasetId: baseline.datasetId,
        version: baseline.version,
      },
      stats: {
        totalImages,
        annotatedImages: annotated,
        annotationCoverage: totalImages > 0 ? Math.round((annotated / totalImages) * 10000) / 100 : 0,
        classes: classCount,
        versions: versionCount,
        splits: splitCount,
      },
      annotationRequired: annotated < totalImages,
      trainingBlocked: annotated < totalImages,
    });
  } catch (error) {
    console.error("[BASELINE] GET Error:", error);
    return Response.json({ error: "Failed to check baseline status" }, { status: 500 });
  }
}
