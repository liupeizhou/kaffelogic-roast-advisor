import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createNeedsReviewAnalysis } from "@/lib/diagnostics";
import { parseKpro } from "@/lib/kpro";
import { analyzeRoastLogImage } from "@/lib/openai-vision";
import {
  findExistingUpload,
  insertUploadRecord,
  uploadOriginalFile,
  upsertRoastLog,
  upsertRoastProfile
} from "@/lib/roast-persistence";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { ParseStatus, UploadAnalysisResult } from "@/lib/types";
import { assertUploadAllowed, buildStoragePath, classifyUpload, hashBuffer, toDataUrl } from "@/lib/uploads";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "缺少上传文件。" }, { status: 400 });
    }

    assertUploadAllowed(file);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const textPreview = buffer.subarray(0, 2048).toString("utf8");
    const hash = hashBuffer(buffer);
    const fileKind = classifyUpload(file.name, file.type, textPreview);

    if (fileKind === "unknown") {
      return NextResponse.json<UploadAnalysisResult>({
        uploadId: null,
        hash,
        fileName: file.name,
        fileKind,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        status: "failed",
        duplicate: false,
        storagePath: null,
        persisted: false,
        error: "不支持的文件类型。请上传 .kpro 或 Kaffelogic log 图片。"
      }, { status: 415 });
    }

    const supabase = await getSupabaseAdmin();
    const existing = supabase ? await findExistingUpload(hash) : null;
    const duplicate = Boolean(existing);
    const storagePath = existing?.storage_path ?? (supabase ? buildStoragePath(fileKind, hash, file.name) : null);

    let profile;
    let logAnalysis;
    let status: ParseStatus = "parsed";

    if (fileKind === "kpro") {
      const text = buffer.toString("utf8");
      profile = parseKpro(text, file.name);
      if (!profile.shortName && !profile.roastCurvePoints.length) status = "needs_review";
    } else if (fileKind === "log_image") {
      try {
        logAnalysis = await analyzeRoastLogImage(toDataUrl(buffer, file.type || "image/png"));
        status = logAnalysis.needsReview ? "needs_review" : "parsed";
      } catch (error) {
        logAnalysis = createNeedsReviewAnalysis(error instanceof Error ? error.message : "视觉解析失败");
        status = "needs_review";
      }
    }

    let uploadId = existing?.id ?? null;
    let persisted = false;
    if (supabase) {
      if (!existing && storagePath) {
        await uploadOriginalFile(storagePath, buffer, file.type || "application/octet-stream");
        const upload = await insertUploadRecord({
          fileName: file.name,
          hash,
          fileKind,
          mimeType: file.type || "application/octet-stream",
          storagePath,
          sizeBytes: file.size,
          status
        });
        uploadId = upload.id;
      }

      if (uploadId && profile) {
        await upsertRoastProfile(uploadId, profile);
      }
      if (uploadId && logAnalysis) {
        await upsertRoastLog(uploadId, logAnalysis);
      }
      persisted = Boolean(uploadId);
    }

    return NextResponse.json<UploadAnalysisResult>({
      uploadId,
      hash,
      fileName: file.name,
      fileKind,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      status,
      duplicate,
      storagePath,
      persisted,
      profile,
      logAnalysis
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "上传分析失败。"
    }, { status: 500 });
  }
}
