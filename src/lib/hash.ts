import { createHash } from "crypto";

export function computeSHA256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function computePerceptualHashSimple(buffer: Buffer): string {
  const hash = createHash("md5").update(buffer).digest("hex");
  return hash;
}

export function sanitizeFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "bin";
  const base = filename
    .replace(/[^a-zA-Z0-9_\-\.]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .substring(0, 100);
  return `${base}.${ext}`;
}

export function generateUniqueFilename(originalFilename: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const ext = originalFilename.split(".").pop()?.toLowerCase() || "jpg";
  const base = originalFilename
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_\-]/g, "_")
    .substring(0, 80);
  return `${base}_${timestamp}_${random}.${ext}`;
}

export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];

export const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "webp"];

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export function isAllowedFileType(filename: string, mimeType?: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const extOk = ALLOWED_EXTENSIONS.includes(ext);
  const mimeOk = !mimeType || ALLOWED_MIME_TYPES.includes(mimeType);
  return extOk && mimeOk;
}
