import { createHash, randomUUID } from "node:crypto";
import type { UploadFileKind } from "@/lib/types";

const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"]);
const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;

export type UploadInspection = {
  fileKind: UploadFileKind;
  mimeType: string;
  textPreview: string;
};

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

export function inspectUploadContent(fileName: string, declaredMimeType: string, buffer: Buffer): UploadInspection {
  const textPreview = buffer.subarray(0, 4096).toString("utf8");
  const textualKind = classifyUpload(fileName, "text/plain", textPreview);
  if (textualKind === "kpro") return { fileKind: "kpro", mimeType: "text/plain", textPreview };
  if (textualKind === "klog") return { fileKind: "klog", mimeType: "text/plain", textPreview };

  const imageMimeType = detectImageMimeType(buffer);
  if (imageMimeType) return { fileKind: "log_image", mimeType: imageMimeType, textPreview: "" };

  const declaredKind = classifyUpload(fileName, declaredMimeType, textPreview);
  if (declaredKind === "log_image") {
    return { fileKind: "unknown", mimeType: declaredMimeType || "application/octet-stream", textPreview };
  }
  return {
    fileKind: declaredKind,
    mimeType: declaredMimeType || "application/octet-stream",
    textPreview
  };
}

export function buildStoragePath(kind: UploadFileKind, hash: string, fileName: string): string {
  const extension = fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".")).toLowerCase() : "";
  const safeExt = extension.replace(/[^a-z0-9.]/g, "") || ".bin";
  return `${kind}/${hash.slice(0, 2)}/${hash}-${randomUUID()}${safeExt}`;
}

export function toDataUrl(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType || "application/octet-stream"};base64,${buffer.toString("base64")}`;
}

function detectImageMimeType(buffer: Buffer): string | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 12
    && buffer.subarray(0, 4).toString("ascii") === "RIFF"
    && buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buffer.subarray(8, 12).toString("ascii").toLowerCase();
    if (brand.startsWith("hei") || brand.startsWith("mif")) return "image/heic";
  }
  return null;
}
