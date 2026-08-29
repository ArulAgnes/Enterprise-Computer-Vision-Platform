import { db } from "@/db";
import { datasets } from "@/db/schema";
import { eq, or, sql } from "drizzle-orm";

/**
 * Safely resolves a dataset identifier to the internal UUID.
 * Accepts either:
 *   - The internal UUID (e.g., "4b270c7e-9ffe-4085-b10b-7dbaba309521")
 *   - The public dataset ID (e.g., "HDB-MTBX6DFS")
 *
 * Returns the full dataset row or null if not found.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function resolveDatasetIdentifier(identifier: string) {
  if (!identifier || !identifier.trim()) return null;
  const id = identifier.trim();

  if (UUID_RE.test(id)) {
    const byId = await db
      .select()
      .from(datasets)
      .where(eq(datasets.id, id))
      .limit(1);
    if (byId.length > 0) return byId[0];
  }

  const byPublicId = await db
    .select()
    .from(datasets)
    .where(eq(datasets.datasetId, id))
    .limit(1);
  if (byPublicId.length > 0) return byPublicId[0];

  return null;
}

/**
 * Same as resolveDatasetIdentifier but throws if not found.
 */
export async function requireDataset(identifier: string) {
  const ds = await resolveDatasetIdentifier(identifier);
  if (!ds) {
    throw new DatasetNotFoundError(identifier);
  }
  return ds;
}

export class DatasetNotFoundError extends Error {
  constructor(identifier: string) {
    super(`Dataset not found: ${identifier}`);
    this.name = "DatasetNotFoundError";
  }
}

/**
 * Returns the internal UUID for a dataset identifier.
 * Useful when you only need the UUID for foreign key queries.
 */
export async function resolveDatasetId(identifier: string): Promise<string | null> {
  const ds = await resolveDatasetIdentifier(identifier);
  return ds?.id ?? null;
}

/**
 * Batch resolve: given a public dataset_id, return the UUID.
 * Caches in-process for the lifetime of the serverless function.
 */
const resolveCache = new Map<string, string>();

export async function resolveDatasetIdCached(identifier: string): Promise<string | null> {
  if (resolveCache.has(identifier)) return resolveCache.get(identifier)!;
  const id = await resolveDatasetId(identifier);
  if (id) resolveCache.set(identifier, id);
  return id;
}
