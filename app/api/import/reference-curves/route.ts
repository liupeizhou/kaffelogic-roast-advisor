import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { parseKpro } from "@/lib/kpro";
import {
  findExistingUpload,
  insertUploadRecord,
  uploadOriginalFile,
  upsertRoastProfile
} from "@/lib/roast-persistence";
import { buildStoragePath, hashBuffer } from "@/lib/uploads";

export const runtime = "nodejs";

const DEFAULT_REFERENCE_ROOT = "/Volumes/Extreme SSD/01_下载归档_Downloads/kaffelogic项目";
const MAX_IMPORT_FILES = 300;

type ImportItem = {
  fileName: string;
  path: string;
  status: "imported" | "skipped" | "failed";
  profileName?: string | null;
  reason?: string;
};

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const files = formData.getAll("files").filter((file): file is File => file instanceof File).slice(0, MAX_IMPORT_FILES);
      const items: ImportItem[] = [];
      for (const file of files) {
        items.push(await importKproFileBuffer(file.name, Buffer.from(await file.arrayBuffer()), "uploaded"));
      }
      return NextResponse.json(buildImportSummary("uploaded-files", items));
    }

    const body = await request.json().catch(() => ({})) as { rootPath?: string };
    const rootPath = typeof body.rootPath === "string" && body.rootPath.trim()
      ? body.rootPath.trim()
      : DEFAULT_REFERENCE_ROOT;

    const rootStats = await stat(rootPath);
    if (!rootStats.isDirectory()) {
      return NextResponse.json({ error: "参考目录不是有效文件夹。", rootPath }, { status: 400 });
    }

    const files = (await collectKproFiles(rootPath)).slice(0, MAX_IMPORT_FILES);
    const items: ImportItem[] = [];

    for (const filePath of files) {
      const fileName = basename(filePath);
      items.push(await importKproFileBuffer(fileName, await readFile(filePath), filePath));
    }

    return NextResponse.json(buildImportSummary(rootPath, items));
  } catch (error) {
    const message = error instanceof Error ? error.message : "批量导入失败。";
    const statusCode = message.includes("Supabase 尚未配置") ? 503 : 500;
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}

async function importKproFileBuffer(fileName: string, buffer: Buffer, path: string): Promise<ImportItem> {
  try {
    if (fileName.startsWith("._") || fileName === ".DS_Store" || !fileName.toLowerCase().endsWith(".kpro")) {
      return { fileName, path, status: "skipped", reason: "非 .kpro 文件。" };
    }
    const hash = hashBuffer(buffer);
    const existing = await findExistingUpload(hash);
    const profile = parseKpro(buffer.toString("utf8"), fileName);

    if (existing) {
      if (existing.id) await upsertRoastProfile(existing.id, profile);
      return {
        fileName,
        path,
        status: "skipped",
        profileName: profile.shortName ?? fileName,
        reason: "重复文件，已按 hash 跳过。"
      };
    }

    const storagePath = buildStoragePath("kpro", hash, fileName);
    await uploadOriginalFile(storagePath, buffer, "text/plain");
    const upload = await insertUploadRecord({
      fileName,
      hash,
      fileKind: "kpro",
      mimeType: "text/plain",
      storagePath,
      sizeBytes: buffer.byteLength,
      status: profile.shortName || profile.roastCurvePoints.length ? "parsed" : "needs_review",
      visibility: "public",
      sourceScope: "official"
    });
    await upsertRoastProfile(upload.id, profile);
    return {
      fileName,
      path,
      status: "imported",
      profileName: profile.shortName ?? fileName
    };
  } catch (error) {
    return {
      fileName,
      path,
      status: "failed",
      reason: error instanceof Error ? error.message : "导入失败。"
    };
  }
}

function buildImportSummary(rootPath: string, items: ImportItem[]) {
  return {
    rootPath,
    total: items.length,
    imported: items.filter((item) => item.status === "imported").length,
    skipped: items.filter((item) => item.status === "skipped").length,
    failed: items.filter((item) => item.status === "failed").length,
    items
  };
}

async function collectKproFiles(rootPath: string): Promise<string[]> {
  const entries = await readdir(rootPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith("._") || entry.name === ".DS_Store") continue;
    const absolutePath = join(rootPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectKproFiles(absolutePath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".kpro")) {
      files.push(absolutePath);
    }
  }

  return files.sort((a, b) => a.localeCompare(b));
}
