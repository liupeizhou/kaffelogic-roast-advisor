import { createHash, randomUUID } from "node:crypto";
import type { UploadFileKind } from "@/lib/types";

const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"]);
const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;

export function hashBuffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function classifyUpload(fileName: string, mimeType: string, firstTextBytes?: string): UploadFileKind {
  const lower = fileName.toLowerCase();
  if (lower.startsWith("._") || lower === ".ds_store") return "unknown";
  if (lower.endsWith(".klog") || (firstTextBytes?.includes("log_file_name:") && firstTextBytes.includes("time\t"))) return "klog";
  if (lower.endsWith(".kpro") || firstTextBytes?.includes("profile_short_name:") || firstTextBytes?.includes("roast_profile:")) return "kpro";
  if (IMAGE_MIME_TYPES.has(mimeType) || /\.(png|jpe?g|webp|heic|heif)$/i.test(fileName)) return "log_image";
  return "unknown";
}

export function assertUploadAllowed(file: File): void {
  if (file.size <= 0) throw new Error("上传文件为空。");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("文件超过 6MB。第一版使用 Supabase standard upload，较大文件请先压缩。");
}

export function buildStoragePath(kind: UploadFileKind, hash: string, fileName: string): string {
  const extension = fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".")).toLowerCase() : "";
  const safeExt = extension.replace(/[^a-z0-9.]/g, "") || ".bin";
  return `${kind}/${hash.slice(0, 2)}/${hash}-${randomUUID()}${safeExt}`;
}

export function toDataUrl(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType || "application/octet-stream"};base64,${buffer.toString("base64")}`;
}
