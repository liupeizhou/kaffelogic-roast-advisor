import type { SupabaseClient } from "@supabase/supabase-js";
import { inferProfileTags } from "@/lib/kpro";
import { getSupabaseAdmin, getUploadBucket } from "@/lib/supabase-admin";
import type { ParseStatus, UploadAnalysisResult, UploadFileKind, UploadRecord } from "@/lib/types";

export type RoastProfileRecord = {
  id: string;
  upload_id: string;
  file_name: string;
  display_name: string;
  short_name: string | null;
  designer: string | null;
  description: string | null;
  source_type: string;
  target_brew: string;
  process_fit: string;
  altitude_range: { min?: number; max?: number } | null;
  recommended_level: number | null;
  expected_first_crack_temp: number | null;
  expected_colour_change_temp: number | null;
  roast_levels: number[];
  roast_curve_points: Array<{ timeSeconds: number; value: number }>;
  fan_curve_points: Array<{ timeSeconds: number; value: number }>;
  raw_fields?: Record<string, string>;
  created_at: string;
  updated_at: string;
};

export async function requireSupabaseAdmin(): Promise<SupabaseClient> {
  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    throw new Error("Supabase 尚未配置。请在后台设置 Supabase URL 和 service role key。");
  }
  return supabase;
}

export async function findExistingUpload(hash: string): Promise<UploadRecord | null> {
  const supabase = await getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("uploads")
    .select("id,file_name,file_hash,file_kind,mime_type,storage_path,size_bytes,parse_status")
    .eq("file_hash", hash)
    .maybeSingle();
  if (error) throw error;
  return data as UploadRecord | null;
}

export async function uploadOriginalFile(path: string, buffer: Buffer, contentType: string) {
  const supabase = await requireSupabaseAdmin();
  const { error } = await supabase.storage.from(await getUploadBucket()).upload(path, buffer, {
    contentType,
    upsert: false
  });
  if (error && error.message !== "The resource already exists") throw error;
}

export async function insertUploadRecord(input: {
  fileName: string;
  hash: string;
  fileKind: UploadFileKind;
  mimeType: string;
  storagePath: string;
  sizeBytes: number;
  status: ParseStatus;
}) {
  const supabase = await requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("uploads")
    .insert({
      file_name: input.fileName,
      file_hash: input.hash,
      file_kind: input.fileKind,
      mime_type: input.mimeType,
      storage_path: input.storagePath,
      size_bytes: input.sizeBytes,
      parse_status: input.status
    })
    .select("id")
    .single();
  if (error) throw error;
  return data as { id: string };
}

export async function upsertRoastProfile(uploadId: string, profile: NonNullable<UploadAnalysisResult["profile"]>) {
  const supabase = await requireSupabaseAdmin();
  const tags = inferProfileTags(profile);
  const { data, error } = await supabase
    .from("roast_profiles")
    .upsert({
      upload_id: uploadId,
      file_name: profile.fileName,
      display_name: profile.shortName ?? profile.fileName,
      short_name: profile.shortName,
      designer: profile.designer,
      description: profile.description,
      source_type: tags.sourceType,
      target_brew: tags.targetBrew,
      process_fit: tags.processFit,
      altitude_range: tags.altitudeRange,
      recommended_level: profile.recommendedLevel,
      expected_first_crack_temp: profile.expectedFirstCrackTemp,
      expected_colour_change_temp: profile.expectedColourChangeTemp,
      roast_levels: profile.roastLevels,
      roast_curve_points: profile.roastCurvePoints,
      fan_curve_points: profile.fanCurvePoints,
      raw_fields: profile.rawFields
    }, { onConflict: "upload_id" })
    .select("id")
    .single();
  if (error) throw error;
  return data as { id: string };
}

export async function upsertRoastLog(uploadId: string, analysis: NonNullable<UploadAnalysisResult["logAnalysis"]>) {
  const supabase = await requireSupabaseAdmin();
  const { error } = await supabase.from("roast_logs").upsert({
    upload_id: uploadId,
    ai_analysis: analysis,
    confirmed_analysis: null,
    confidence: analysis.confidence,
    needs_review: analysis.needsReview,
    parse_status: analysis.needsReview ? "needs_review" : "parsed"
  }, { onConflict: "upload_id" });
  if (error) throw error;
}

export async function listRoastProfiles(limit = 120): Promise<RoastProfileRecord[]> {
  const supabase = await requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("roast_profiles")
    .select([
      "id",
      "upload_id",
      "file_name",
      "display_name",
      "short_name",
      "designer",
      "description",
      "source_type",
      "target_brew",
      "process_fit",
      "altitude_range",
      "recommended_level",
      "expected_first_crack_temp",
      "expected_colour_change_temp",
      "roast_levels",
      "roast_curve_points",
      "fan_curve_points",
      "raw_fields",
      "created_at",
      "updated_at"
    ].join(","))
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as RoastProfileRecord[];
}
