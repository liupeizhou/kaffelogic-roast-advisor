import { NextResponse } from "next/server";
import { requireUserResponse } from "@/lib/auth";
import { createNeedsReviewAnalysis } from "@/lib/diagnostics";
import { analyzeKlog, parseKlog } from "@/lib/klog";
import { parseKpro } from "@/lib/kpro";
import { analyzeRoastLogImage } from "@/lib/openai-vision";
import { chargeSuccessfulAnalysis, getQuotaSnapshot } from "@/lib/quota";
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
  const { user, denied } = await requireUserResponse();
  if (denied) return denied;

  try {
    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase 尚未配置，无法保存上传和扣减额度。" }, { status: 503 });
    }
    const quotaBefore = await getQuotaSnapshot(supabase, user.id);
    if (!quotaBefore.canAnalyze) {
      return NextResponse.json({ error: "今日或本月额度已用尽，请订阅或充值按量次数。", quotaSnapshot: quotaBefore }, { status: 402 });
    }

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

    const existing = await findExistingUpload(hash, user.id);
    const duplicate = Boolean(existing);
    const storagePath = existing?.storage_path ?? `users/${user.id}/${buildStoragePath(fileKind, hash, file.name)}`;

    let profile;
    let klog;
    let logAnalysis;
    let status: ParseStatus = "parsed";

    if (fileKind === "kpro") {
      const text = buffer.toString("utf8");
      profile = parseKpro(text, file.name);
      if (!profile.shortName && !profile.roastCurvePoints.length) status = "needs_review";
    } else if (fileKind === "klog") {
      const text = buffer.toString("utf8");
      klog = parseKlog(text, file.name);
      logAnalysis = analyzeKlog(klog);
      status = logAnalysis.needsReview ? "needs_review" : "parsed";
    } else if (fileKind === "log_image") {
      try {
        logAnalysis = await analyzeRoastLogImage(toDataUrl(buffer, file.type || "image/png"));
        status = logAnalysis.needsReview ? "needs_review" : "parsed";
      } catch (error) {
        logAnalysis = createNeedsReviewAnalysis(error instanceof Error ? error.message : "视觉解析失败");
        status = "failed";
      }
    }

    let uploadId = existing?.id ?? null;
    let persisted = false;
    if (!existing && storagePath) {
      await uploadOriginalFile(storagePath, buffer, file.type || "application/octet-stream");
      const upload = await insertUploadRecord({
        ownerId: user.id,
        fileName: file.name,
        hash,
        fileKind,
        mimeType: file.type || "application/octet-stream",
        storagePath,
        sizeBytes: file.size,
        status,
        visibility: "private",
        sourceScope: "user"
      });
      uploadId = upload.id;
    }

    if (uploadId && profile) {
      await upsertRoastProfile(uploadId, profile, user.id);
    }
    if (uploadId && logAnalysis) {
      await upsertRoastLog(uploadId, logAnalysis, user.id, klog ?? null);
    }
    persisted = Boolean(uploadId);

    const shouldCharge = status !== "failed" && Boolean(profile || klog || logAnalysis);
    const quotaSnapshot = shouldCharge
      ? await chargeSuccessfulAnalysis({
        supabase,
        userId: user.id,
        uploadId,
        metadata: { fileKind, duplicate, fileName: file.name }
      })
      : quotaBefore;

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
      klog,
      logAnalysis,
      quotaSnapshot
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "上传分析失败。"
    }, { status: 500 });
  }
}
