import type { SupabaseClient } from "@supabase/supabase-js";
import { inferProfileTags } from "@/lib/kpro";
import { getSupabaseAdmin, getUploadBucket } from "@/lib/supabase-admin";
import type { CurvePoint, KproProfile, ParseStatus, UploadAnalysisResult, UploadFileKind, UploadRecord } from "@/lib/types";

export type RoastProfileRecord = {
  id: string;
  upload_id: string;
  owner_id: string | null;
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

export type CurveDocumentRecord = {
  id: string;
  owner_id: string;
  title: string;
  short_name: string | null;
  designer: string | null;
  description: string | null;
  recommended_level: number | null;
  expected_first_crack_temp: number | null;
  expected_colour_change_temp: number | null;
  roast_levels: number[];
  roast_curve_points: CurvePoint[];
  fan_curve_points: CurvePoint[];
  raw_fields: Record<string, string>;
  visibility: "private" | "public" | "unlisted";
  created_at: string;
  updated_at: string;
};

export type SharePageRecord = {
  id: string;
  curve_document_id: string;
  owner_id: string;
  slug: string;
  template: "barista" | "baroque" | "cyberpunk";
  title: string;
  summary: string;
  ai_prediction: string;
  quote_text: string;
  quote_author: string;
  quote_work: string | null;
  quote_source_note: string | null;
  is_public: boolean;
  curve_documents: CurveDocumentRecord | null;
};

export async function requireSupabaseAdmin(): Promise<SupabaseClient> {
  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    throw new Error("Supabase 尚未配置。请在后台设置 Supabase URL 和 service role key。");
  }
  return supabase;
}

export async function findExistingUpload(hash: string, ownerId: string | null = null): Promise<UploadRecord | null> {
  const supabase = await getSupabaseAdmin();
  if (!supabase) return null;
  let query = supabase
    .from("uploads")
    .select("id,owner_id,file_name,file_hash,file_kind,mime_type,storage_path,size_bytes,parse_status,visibility,source_scope")
    .eq("file_hash", hash);
  query = ownerId ? query.eq("owner_id", ownerId) : query.is("owner_id", null);
  const { data, error } = await query.maybeSingle();
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
  ownerId?: string | null;
  fileName: string;
  hash: string;
  fileKind: UploadFileKind;
  mimeType: string;
  storagePath: string;
  sizeBytes: number;
  status: ParseStatus;
  visibility?: "private" | "public" | "unlisted";
  sourceScope?: "user" | "official" | "community" | "system";
}) {
  const supabase = await requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("uploads")
    .insert({
      owner_id: input.ownerId ?? null,
      file_name: input.fileName,
      file_hash: input.hash,
      file_kind: input.fileKind,
      mime_type: input.mimeType,
      storage_path: input.storagePath,
      size_bytes: input.sizeBytes,
      parse_status: input.status,
      visibility: input.visibility ?? "private",
      source_scope: input.sourceScope ?? (input.ownerId ? "user" : "official")
    })
    .select("id")
    .single();
  if (error) throw error;
  return data as { id: string };
}

export async function upsertRoastProfile(uploadId: string, profile: NonNullable<UploadAnalysisResult["profile"]>, ownerId: string | null = null) {
  const supabase = await requireSupabaseAdmin();
  const tags = inferProfileTags(profile);
  const sourceScope = ownerId ? "user" : tags.sourceType === "official" ? "official" : "community";
  const { data, error } = await supabase
    .from("roast_profiles")
    .upsert({
      upload_id: uploadId,
      owner_id: ownerId,
      file_name: profile.fileName,
      display_name: profile.shortName ?? profile.fileName,
      short_name: profile.shortName,
      designer: profile.designer,
      description: profile.description,
      source_type: tags.sourceType,
      source_scope: sourceScope,
      visibility: ownerId ? "private" : "public",
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

export async function upsertRoastLog(uploadId: string, analysis: NonNullable<UploadAnalysisResult["logAnalysis"]>, ownerId: string | null = null) {
  const supabase = await requireSupabaseAdmin();
  const { error } = await supabase.from("roast_logs").upsert({
    upload_id: uploadId,
    owner_id: ownerId,
    visibility: ownerId ? "private" : "public",
    source_scope: ownerId ? "user" : "official",
    ai_analysis: analysis,
    confirmed_analysis: null,
    confidence: analysis.confidence,
    needs_review: analysis.needsReview,
    parse_status: analysis.needsReview ? "needs_review" : "parsed"
  }, { onConflict: "upload_id" });
  if (error) throw error;
}

export async function listRoastProfiles(limit = 120, ownerId?: string | null): Promise<RoastProfileRecord[]> {
  const supabase = await requireSupabaseAdmin();
  let query = supabase
    .from("roast_profiles")
    .select([
      "id",
      "upload_id",
      "owner_id",
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
  query = ownerId ? query.or(`visibility.in.(public,unlisted),owner_id.eq.${ownerId}`) : query.in("visibility", ["public", "unlisted"]);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as RoastProfileRecord[];
}

export async function listCurveDocuments(ownerId: string): Promise<CurveDocumentRecord[]> {
  const supabase = await requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("curve_documents")
    .select("*")
    .eq("owner_id", ownerId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as CurveDocumentRecord[];
}

export async function getCurveDocument(id: string, ownerId: string): Promise<CurveDocumentRecord | null> {
  const supabase = await requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("curve_documents")
    .select("*")
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as CurveDocumentRecord | null;
}

export async function saveCurveDocument(input: {
  ownerId: string;
  id?: string | null;
  profile: KproProfile;
  visibility?: "private" | "public" | "unlisted";
}): Promise<CurveDocumentRecord> {
  const supabase = await requireSupabaseAdmin();
  const payload = {
    owner_id: input.ownerId,
    title: input.profile.shortName ?? input.profile.fileName,
    short_name: input.profile.shortName,
    designer: input.profile.designer,
    description: input.profile.description,
    recommended_level: input.profile.recommendedLevel,
    expected_first_crack_temp: input.profile.expectedFirstCrackTemp,
    expected_colour_change_temp: input.profile.expectedColourChangeTemp,
    roast_levels: input.profile.roastLevels,
    roast_curve_points: input.profile.roastCurvePoints,
    fan_curve_points: input.profile.fanCurvePoints,
    raw_fields: input.profile.rawFields,
    visibility: input.visibility ?? "private"
  };
  const { data, error } = input.id
    ? await supabase.from("curve_documents").update(payload).eq("id", input.id).eq("owner_id", input.ownerId).select("*").single()
    : await supabase.from("curve_documents").insert(payload).select("*").single();
  if (error) throw error;
  const document = data as unknown as CurveDocumentRecord;
  await insertCurveVersion(document, input.profile);
  return document;
}

async function insertCurveVersion(document: CurveDocumentRecord, profile: KproProfile) {
  const supabase = await requireSupabaseAdmin();
  const { data: latest, error: latestError } = await supabase
    .from("curve_versions")
    .select("version_number")
    .eq("curve_document_id", document.id)
    .order("version_number", { ascending: false })
    .limit(1);
  if (latestError) throw latestError;
  const versionNumber = Number(latest?.[0]?.version_number ?? 0) + 1;
  const { error } = await supabase.from("curve_versions").insert({
    curve_document_id: document.id,
    owner_id: document.owner_id,
    version_number: versionNumber,
    snapshot: profile
  });
  if (error) throw error;
}

export async function createSharePage(input: {
  ownerId: string;
  curveDocumentId: string;
  template: "barista" | "baroque" | "cyberpunk";
  title: string;
  summary: string;
  aiPrediction: string;
  quoteText: string;
  quoteAuthor: string;
  quoteWork?: string | null;
  quoteSourceNote?: string | null;
}) {
  const supabase = await requireSupabaseAdmin();
  const slug = await createUniqueSlug(input.title);
  const { data, error } = await supabase.from("share_pages").insert({
    curve_document_id: input.curveDocumentId,
    owner_id: input.ownerId,
    slug,
    template: input.template,
    title: input.title,
    summary: input.summary,
    ai_prediction: input.aiPrediction,
    quote_text: input.quoteText,
    quote_author: input.quoteAuthor,
    quote_work: input.quoteWork ?? null,
    quote_source_note: input.quoteSourceNote ?? null,
    is_public: true
  }).select("slug").single();
  if (error) throw error;
  return data as { slug: string };
}

export async function getSharePage(slug: string): Promise<SharePageRecord | null> {
  const supabase = await requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("share_pages")
    .select("*,curve_documents(*)")
    .eq("slug", slug)
    .eq("is_public", true)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as SharePageRecord | null;
}

async function createUniqueSlug(title: string) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "curve";
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}
