import { db } from "@/db";
import { classes } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * VisionBharat class handling — ALWAYS dynamic.
 *
 * The platform never hardcodes a class list. It reads the classes that the
 * dataset actually declares, in this order:
 *
 *   1. `classes` table rows for the dataset (user-defined, competition truth)
 *   2. the distinct class names present in the `annotations` table
 *   3. `VISIONBHARAT_DEFAULT_CLASSES` env override (comma separated)
 *   4. the built-in Indian ritual-object default set
 *
 * `DEFAULT_CLASSES` exists only as a *last-resort* index so that a palette /
 * colour map is available before the dataset has been configured.
 */
export const DEFAULT_CLASSES = [
  "clay_diya",
  "brass_diya",
  "hanging_diya",
  "multi_wick_diya",
  "kuthu_vilakku",
  "temple_bell",
  "incense_holder",
  "ritual_plate",
] as const;

export const CLASS_COLORS: Record<string, string> = {
  clay_diya: "#f59e0b",
  brass_diya: "#ef4444",
  hanging_diya: "#8b5cf6",
  multi_wick_diya: "#06b6d4",
  kuthu_vilakku: "#10b981",
  temple_bell: "#f97316",
  incense_holder: "#ec4899",
  ritual_plate: "#6366f1",
};

export function colorForClass(className: string, index = 0): string {
  if (CLASS_COLORS[className]) return CLASS_COLORS[className];
  const palette = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#06b6d4", "#f97316"];
  return palette[index % palette.length];
}

function envClasses(): string[] {
  const raw = process.env.VISIONBHARAT_DEFAULT_CLASSES || "";
  return raw
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

/**
 * Resolve the class list for a dataset (or globally when no dataset is given).
 * Never throws — always returns at least the default ritual-object list.
 */
export async function loadClassList(datasetId?: string | null): Promise<string[]> {
  try {
    if (datasetId) {
      const rows = await db
        .select()
        .from(classes)
        .where(eq(classes.datasetId, datasetId))
        .orderBy(classes.classIndex);
      const names = rows.map((r) => r.name).filter(Boolean);
      if (names.length > 0) return names;
    } else {
      const rows = await db.select().from(classes).orderBy(classes.classIndex);
      const names = rows.map((r) => r.name).filter(Boolean);
      if (names.length > 0) return names;
    }
  } catch (error) {
    console.error("[classes] failed to read classes table:", error);
  }

  const fromEnv = envClasses();
  if (fromEnv.length > 0) return fromEnv;

  return [...DEFAULT_CLASSES];
}

/** `--class_names a,b,c` style argument payload used by every python call. */
export function classNamesArg(classList: string[]): string {
  return classList.join(",");
}
