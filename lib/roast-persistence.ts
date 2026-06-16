import type { SupabaseClient } from "@supabase/supabase-js";
import { scoreCurveAgainstReference, type CurveScoreResult } from "@/lib/curve-scoring";
import { inferProfileTags } from "@/lib/kpro";
import { getSupabaseAdmin, getUploadBucket } from "@/lib/supabase-admin";
import type { CurvePoint, KlogParseResult, KproProfile, ParseStatus, RoastLogAnalysis, UploadAnalysisResult, UploadFileKind, UploadRecord } from "@/lib/types";

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
  source_scope?: "user" | "official" | "community" | "system";
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
  download_count?: number;
  review_count?: number;
  rating_average?: number;
  leaderboard_score?: number;
  initial_recommendation_score?: number | null;
  initial_recommendation_notes?: string[];
  tags?: CurveTagRecord[];
  groups?: CurveGroupRecord[];
  created_at: string;
  updated_at: string;
};

export type CurveTagRecord = {
  id: string;
  name: string;
  slug: string;
  color: string;
  description: string | null;
};

export type CurveGroupRecord = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
};

export type ProfileChangeLogRecord = {
  id: string;
  profile_id: string;
  actor_id: string | null;
  action: "taxonomy_update" | "initial_recommendation" | "rollback" | string;
  before_snapshot: ProfileTaxonomySnapshot;
  after_snapshot: ProfileTaxonomySnapshot;
  note: string | null;
  created_at: string;
};

export type ProfileTaxonomySnapshot = {
  tagNames: string[];
  groupNames: string[];
  initialRecommendationScore: number | null;
  initialRecommendationNotes: string[];
};

export type ProfileTaxonomyAdminPayload = {
  profile: RoastProfileRecord;
  allTags: CurveTagRecord[];
  allGroups: CurveGroupRecord[];
  changeLogs: ProfileChangeLogRecord[];
};

export type RoastProfileReviewRecord = {
  id: string;
  profile_id: string;
  owner_id: string;
  rating: number;
  body: string;
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

export type UploadHistoryItem = {
  upload: UploadRecord & { created_at?: string; updated_at?: string };
  profile: RoastProfileRecord | null;
  log: {
    ai_analysis: RoastLogAnalysis | null;
    confirmed_analysis: RoastLogAnalysis | null;
    parsed_payload: KlogParseResult | null;
    confidence: number | null;
    needs_review: boolean;
    parse_status: ParseStatus;
  } | null;
  latestScore: (CurveScoreResult & {
    id: string;
    baselineKind: "public_profile" | "user_curve";
    createdAt: string;
  }) | null;
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
  const initialRecommendation = calculateInitialRecommendation({
    description: profile.description,
    recommended_level: profile.recommendedLevel,
    expected_first_crack_temp: profile.expectedFirstCrackTemp,
    expected_colour_change_temp: profile.expectedColourChangeTemp,
    roast_levels: profile.roastLevels,
    roast_curve_points: profile.roastCurvePoints,
    fan_curve_points: profile.fanCurvePoints,
    process_fit: tags.processFit,
    target_brew: tags.targetBrew,
    raw_fields: profile.rawFields
  });
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
      raw_fields: profile.rawFields,
      initial_recommendation_score: initialRecommendation.score,
      initial_recommendation_notes: initialRecommendation.notes
    }, { onConflict: "upload_id" })
    .select("id")
    .single();
  if (error) throw error;
  return data as { id: string };
}

export async function upsertRoastLog(
  uploadId: string,
  analysis: NonNullable<UploadAnalysisResult["logAnalysis"]>,
  ownerId: string | null = null,
  parsedPayload: KlogParseResult | null = null
) {
  const supabase = await requireSupabaseAdmin();
  const { error } = await supabase.from("roast_logs").upsert({
    upload_id: uploadId,
    owner_id: ownerId,
    visibility: ownerId ? "private" : "public",
    source_scope: ownerId ? "user" : "official",
    ai_analysis: analysis,
    confirmed_analysis: null,
    parsed_payload: parsedPayload,
    confidence: analysis.confidence,
    needs_review: analysis.needsReview,
    parse_status: analysis.needsReview ? "needs_review" : "parsed"
  }, { onConflict: "upload_id" });
  if (error) throw error;
}

export async function listUploadHistory(ownerId: string, limit = 30): Promise<UploadHistoryItem[]> {
  const supabase = await requireSupabaseAdmin();
  const { data: uploads, error: uploadError } = await supabase
    .from("uploads")
    .select("id,owner_id,file_name,file_hash,file_kind,mime_type,storage_path,size_bytes,parse_status,visibility,source_scope,created_at,updated_at")
    .eq("owner_id", ownerId)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (uploadError) throw uploadError;
  const uploadRows = (uploads ?? []) as Array<UploadHistoryItem["upload"]>;
  const uploadIds = uploadRows.map((upload) => upload.id);
  if (!uploadIds.length) return [];

  const [profilesResult, logsResult, scoresResult] = await Promise.all([
    supabase.from("roast_profiles").select("*").in("upload_id", uploadIds),
    supabase.from("roast_logs").select("upload_id,ai_analysis,confirmed_analysis,parsed_payload,confidence,needs_review,parse_status").in("upload_id", uploadIds),
    supabase
      .from("roast_profile_scores")
      .select("id,upload_id,baseline_kind,score,rating,metrics,notes,created_at")
      .in("upload_id", uploadIds)
      .order("created_at", { ascending: false })
  ]);
  if (profilesResult.error) throw profilesResult.error;
  if (logsResult.error) throw logsResult.error;
  if (scoresResult.error) throw scoresResult.error;

  const profilesByUpload = new Map<string, RoastProfileRecord>();
  for (const profile of profilesResult.data ?? []) {
    profilesByUpload.set(String(profile.upload_id), profile as unknown as RoastProfileRecord);
  }

  const logsByUpload = new Map<string, UploadHistoryItem["log"]>();
  for (const log of logsResult.data ?? []) {
    logsByUpload.set(String(log.upload_id), {
      ai_analysis: log.ai_analysis as RoastLogAnalysis | null,
      confirmed_analysis: log.confirmed_analysis as RoastLogAnalysis | null,
      parsed_payload: log.parsed_payload as KlogParseResult | null,
      confidence: typeof log.confidence === "number" ? log.confidence : null,
      needs_review: Boolean(log.needs_review),
      parse_status: log.parse_status as ParseStatus
    });
  }

  const latestScoreByUpload = new Map<string, UploadHistoryItem["latestScore"]>();
  for (const score of scoresResult.data ?? []) {
    const uploadId = String(score.upload_id);
    if (latestScoreByUpload.has(uploadId)) continue;
    latestScoreByUpload.set(uploadId, {
      id: String(score.id),
      baselineKind: score.baseline_kind as "public_profile" | "user_curve",
      score: Number(score.score),
      rating: score.rating as CurveScoreResult["rating"],
      metrics: score.metrics as CurveScoreResult["metrics"],
      notes: Array.isArray(score.notes) ? score.notes as string[] : [],
      createdAt: String(score.created_at)
    });
  }

  return uploadRows.map((upload) => ({
    upload,
    profile: profilesByUpload.get(upload.id) ?? null,
    log: logsByUpload.get(upload.id) ?? null,
    latestScore: latestScoreByUpload.get(upload.id) ?? null
  }));
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
      "source_scope",
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
      "download_count",
      "review_count",
      "rating_average",
      "leaderboard_score",
      "initial_recommendation_score",
      "initial_recommendation_notes",
      "created_at",
      "updated_at"
    ].join(","))
    .order("created_at", { ascending: false })
    .limit(limit);
  query = ownerId ? query.or(`visibility.in.(public,unlisted),owner_id.eq.${ownerId}`) : query.in("visibility", ["public", "unlisted"]);
  const { data, error } = await query;
  if (error) throw error;
  return attachProfileTaxonomy((data ?? []) as unknown as RoastProfileRecord[]);
}

export async function listRoastProfileLeaderboard(limit = 50, ownerId?: string | null): Promise<RoastProfileRecord[]> {
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
      "source_scope",
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
      "download_count",
      "review_count",
      "rating_average",
      "leaderboard_score",
      "initial_recommendation_score",
      "initial_recommendation_notes",
      "created_at",
      "updated_at"
    ].join(","))
    .order("leaderboard_score", { ascending: false })
    .order("download_count", { ascending: false })
    .limit(limit);
  query = ownerId ? query.or(`visibility.in.(public,unlisted),owner_id.eq.${ownerId}`) : query.in("visibility", ["public", "unlisted"]);
  const { data, error } = await query;
  if (error) throw error;
  return attachProfileTaxonomy((data ?? []) as unknown as RoastProfileRecord[]);
}

export async function getRoastProfile(profileId: string, ownerId?: string | null): Promise<RoastProfileRecord | null> {
  const supabase = await requireSupabaseAdmin();
  let query = supabase
    .from("roast_profiles")
    .select("*")
    .eq("id", profileId);
  query = ownerId ? query.or(`visibility.in.(public,unlisted),owner_id.eq.${ownerId}`) : query.in("visibility", ["public", "unlisted"]);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  const profile = data as unknown as RoastProfileRecord | null;
  if (!profile) return null;
  const [withTaxonomy] = await attachProfileTaxonomy([profile]);
  return withTaxonomy ?? profile;
}

async function attachProfileTaxonomy(profiles: RoastProfileRecord[]): Promise<RoastProfileRecord[]> {
  const profileIds = profiles.map((profile) => profile.id).filter(Boolean);
  if (!profileIds.length) return profiles;
  const supabase = await requireSupabaseAdmin();
  const [tagLinksResult, groupLinksResult] = await Promise.all([
    supabase
      .from("roast_profile_tag_links")
      .select("profile_id,curve_tags(id,name,slug,color,description)")
      .in("profile_id", profileIds),
    supabase
      .from("roast_profile_group_links")
      .select("profile_id,curve_groups(id,name,slug,description,sort_order)")
      .in("profile_id", profileIds)
  ]);

  if (tagLinksResult.error) throw tagLinksResult.error;
  if (groupLinksResult.error) throw groupLinksResult.error;

  const tagsByProfile = new Map<string, CurveTagRecord[]>();
  for (const link of tagLinksResult.data ?? []) {
    const tag = Array.isArray(link.curve_tags) ? link.curve_tags[0] : link.curve_tags;
    if (!tag) continue;
    const items = tagsByProfile.get(String(link.profile_id)) ?? [];
    items.push(tag as CurveTagRecord);
    tagsByProfile.set(String(link.profile_id), items);
  }

  const groupsByProfile = new Map<string, CurveGroupRecord[]>();
  for (const link of groupLinksResult.data ?? []) {
    const group = Array.isArray(link.curve_groups) ? link.curve_groups[0] : link.curve_groups;
    if (!group) continue;
    const items = groupsByProfile.get(String(link.profile_id)) ?? [];
    items.push(group as CurveGroupRecord);
    groupsByProfile.set(String(link.profile_id), items);
  }

  return profiles.map((profile) => ({
    ...profile,
    initial_recommendation_notes: normalizeNotes(profile.initial_recommendation_notes),
    tags: tagsByProfile.get(profile.id) ?? [],
    groups: (groupsByProfile.get(profile.id) ?? []).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
  }));
}

export async function getProfileTaxonomyAdmin(profileId: string): Promise<ProfileTaxonomyAdminPayload> {
  const supabase = await requireSupabaseAdmin();
  const [profileResult, tagsResult, groupsResult, logsResult] = await Promise.all([
    supabase.from("roast_profiles").select("*").eq("id", profileId).maybeSingle(),
    supabase.from("curve_tags").select("id,name,slug,color,description").order("name", { ascending: true }),
    supabase.from("curve_groups").select("id,name,slug,description,sort_order").order("sort_order", { ascending: true }).order("name", { ascending: true }),
    supabase
      .from("roast_profile_change_logs")
      .select("id,profile_id,actor_id,action,before_snapshot,after_snapshot,note,created_at")
      .eq("profile_id", profileId)
      .order("created_at", { ascending: false })
      .limit(30)
  ]);

  if (profileResult.error) throw profileResult.error;
  if (tagsResult.error) throw tagsResult.error;
  if (groupsResult.error) throw groupsResult.error;
  if (logsResult.error) throw logsResult.error;
  if (!profileResult.data) throw new Error("曲线不存在。");

  const [profile] = await attachProfileTaxonomy([profileResult.data as unknown as RoastProfileRecord]);
  return {
    profile,
    allTags: (tagsResult.data ?? []) as unknown as CurveTagRecord[],
    allGroups: (groupsResult.data ?? []) as unknown as CurveGroupRecord[],
    changeLogs: (logsResult.data ?? []).map((log) => ({
      ...log,
      before_snapshot: normalizeSnapshot(log.before_snapshot),
      after_snapshot: normalizeSnapshot(log.after_snapshot)
    })) as ProfileChangeLogRecord[]
  };
}

export async function updateProfileTaxonomyAdmin(input: {
  profileId: string;
  actorId: string;
  tagNames: string[];
  groupNames: string[];
  initialScore: number | null;
  initialNotes: string[];
  note?: string | null;
  action?: "taxonomy_update" | "initial_recommendation";
}): Promise<ProfileTaxonomyAdminPayload> {
  const snapshot: ProfileTaxonomySnapshot = {
    tagNames: normalizeNameList(input.tagNames),
    groupNames: normalizeNameList(input.groupNames),
    initialRecommendationScore: normalizeScore(input.initialScore),
    initialRecommendationNotes: normalizeNotes(input.initialNotes)
  };
  const before = await getProfileTaxonomySnapshot(input.profileId);
  await applyProfileTaxonomySnapshot(input.profileId, input.actorId, snapshot);
  const after = await getProfileTaxonomySnapshot(input.profileId);
  await insertProfileChangeLog({
    profileId: input.profileId,
    actorId: input.actorId,
    action: input.action ?? "taxonomy_update",
    before,
    after,
    note: input.note ?? null
  });
  return getProfileTaxonomyAdmin(input.profileId);
}

export async function applyInitialRecommendationAdmin(input: {
  profileId: string;
  actorId: string;
}): Promise<ProfileTaxonomyAdminPayload> {
  const current = await getProfileTaxonomyAdmin(input.profileId);
  const recommendation = calculateInitialRecommendation(current.profile);
  return updateProfileTaxonomyAdmin({
    profileId: input.profileId,
    actorId: input.actorId,
    tagNames: current.profile.tags?.map((tag) => tag.name) ?? [],
    groupNames: current.profile.groups?.map((group) => group.name) ?? [],
    initialScore: recommendation.score,
    initialNotes: recommendation.notes,
    action: "initial_recommendation",
    note: "系统重新生成初始评分推荐。"
  });
}

export async function rollbackProfileTaxonomyAdmin(input: {
  profileId: string;
  actorId: string;
  changeId: string;
}): Promise<ProfileTaxonomyAdminPayload> {
  const supabase = await requireSupabaseAdmin();
  const { data: log, error } = await supabase
    .from("roast_profile_change_logs")
    .select("id,profile_id,before_snapshot")
    .eq("id", input.changeId)
    .eq("profile_id", input.profileId)
    .maybeSingle();
  if (error) throw error;
  if (!log) throw new Error("可回滚的变更记录不存在。");

  const before = await getProfileTaxonomySnapshot(input.profileId);
  const target = normalizeSnapshot(log.before_snapshot);
  await applyProfileTaxonomySnapshot(input.profileId, input.actorId, target);
  const after = await getProfileTaxonomySnapshot(input.profileId);
  await insertProfileChangeLog({
    profileId: input.profileId,
    actorId: input.actorId,
    action: "rollback",
    before,
    after,
    note: `回滚到变更 ${input.changeId} 之前的分类与评分快照。`
  });
  return getProfileTaxonomyAdmin(input.profileId);
}

async function getProfileTaxonomySnapshot(profileId: string): Promise<ProfileTaxonomySnapshot> {
  const payload = await getProfileTaxonomyAdmin(profileId);
  return {
    tagNames: payload.profile.tags?.map((tag) => tag.name) ?? [],
    groupNames: payload.profile.groups?.map((group) => group.name) ?? [],
    initialRecommendationScore: normalizeScore(payload.profile.initial_recommendation_score ?? null),
    initialRecommendationNotes: normalizeNotes(payload.profile.initial_recommendation_notes)
  };
}

async function applyProfileTaxonomySnapshot(profileId: string, actorId: string, snapshot: ProfileTaxonomySnapshot) {
  const supabase = await requireSupabaseAdmin();
  const [tags, groups] = await Promise.all([
    ensureCurveTags(snapshot.tagNames, actorId),
    ensureCurveGroups(snapshot.groupNames, actorId)
  ]);

  const [deleteTags, deleteGroups, updateProfile] = await Promise.all([
    supabase.from("roast_profile_tag_links").delete().eq("profile_id", profileId),
    supabase.from("roast_profile_group_links").delete().eq("profile_id", profileId),
    supabase
      .from("roast_profiles")
      .update({
        initial_recommendation_score: snapshot.initialRecommendationScore,
        initial_recommendation_notes: snapshot.initialRecommendationNotes,
        updated_at: new Date().toISOString()
      })
      .eq("id", profileId)
  ]);
  if (deleteTags.error) throw deleteTags.error;
  if (deleteGroups.error) throw deleteGroups.error;
  if (updateProfile.error) throw updateProfile.error;

  if (tags.length) {
    const { error } = await supabase.from("roast_profile_tag_links").insert(tags.map((tag) => ({
      profile_id: profileId,
      tag_id: tag.id,
      created_by: actorId
    })));
    if (error) throw error;
  }
  if (groups.length) {
    const { error } = await supabase.from("roast_profile_group_links").insert(groups.map((group) => ({
      profile_id: profileId,
      group_id: group.id,
      created_by: actorId
    })));
    if (error) throw error;
  }
}

async function ensureCurveTags(names: string[], actorId: string): Promise<CurveTagRecord[]> {
  const supabase = await requireSupabaseAdmin();
  const cleanNames = normalizeNameList(names);
  if (!cleanNames.length) return [];
  const payload = cleanNames.map((name) => ({
    name,
    slug: slugifyTaxonomy(name),
    created_by: actorId
  }));
  const { data, error } = await supabase
    .from("curve_tags")
    .upsert(payload, { onConflict: "slug" })
    .select("id,name,slug,color,description");
  if (error) throw error;
  return (data ?? []) as unknown as CurveTagRecord[];
}

async function ensureCurveGroups(names: string[], actorId: string): Promise<CurveGroupRecord[]> {
  const supabase = await requireSupabaseAdmin();
  const cleanNames = normalizeNameList(names);
  if (!cleanNames.length) return [];
  const payload = cleanNames.map((name, index) => ({
    name,
    slug: slugifyTaxonomy(name),
    sort_order: index * 10,
    created_by: actorId
  }));
  const { data, error } = await supabase
    .from("curve_groups")
    .upsert(payload, { onConflict: "slug" })
    .select("id,name,slug,description,sort_order");
  if (error) throw error;
  return (data ?? []) as unknown as CurveGroupRecord[];
}

async function insertProfileChangeLog(input: {
  profileId: string;
  actorId: string;
  action: string;
  before: ProfileTaxonomySnapshot;
  after: ProfileTaxonomySnapshot;
  note: string | null;
}) {
  const supabase = await requireSupabaseAdmin();
  const { error } = await supabase.from("roast_profile_change_logs").insert({
    profile_id: input.profileId,
    actor_id: input.actorId,
    action: input.action,
    before_snapshot: input.before,
    after_snapshot: input.after,
    note: input.note
  });
  if (error) throw error;
}

export function calculateInitialRecommendation(profile: Partial<RoastProfileRecord> & {
  raw_fields?: Record<string, string>;
}): { score: number; notes: string[] } {
  let score = 50;
  const notes: string[] = [];
  const roastPoints = profile.roast_curve_points ?? [];
  const fanPoints = profile.fan_curve_points ?? [];

  if (roastPoints.length >= 12) {
    score += 14;
    notes.push("温度曲线点位较完整，适合进入资料库做推荐。");
  } else if (roastPoints.length >= 6) {
    score += 8;
    notes.push("温度曲线有基础点位，可用于初步推荐。");
  } else {
    score -= 8;
    notes.push("温度曲线点位偏少，建议人工确认曲线来源和适用范围。");
  }

  if (fanPoints.length >= 4) {
    score += 8;
    notes.push("风速曲线可读，有助于判断热量与排湿策略。");
  } else {
    score -= 4;
    notes.push("风速曲线信息较少，推荐时需保守使用。");
  }

  if (typeof profile.recommended_level === "number") {
    score += 8;
    notes.push(`已标注推荐 Level ${profile.recommended_level}。`);
  } else {
    score -= 6;
    notes.push("缺少推荐 Level，建议管理组补充。");
  }

  if (typeof profile.expected_first_crack_temp === "number") {
    score += 8;
    notes.push("包含预计一爆温度，可用于烘焙节点校验。");
  } else {
    score -= 4;
    notes.push("缺少预计一爆温度，推荐解释可信度会降低。");
  }

  if (typeof profile.expected_colour_change_temp === "number") {
    score += 4;
    notes.push("包含转黄/颜色变化预期，适合做前段判断。");
  }

  if (Array.isArray(profile.roast_levels) && profile.roast_levels.length >= 3) {
    score += 5;
    notes.push("Roast levels 信息完整，便于映射不同烘焙度。");
  }

  if (profile.description && profile.description.trim().length >= 40) {
    score += 6;
    notes.push("说明文本较完整，可支持用户理解适用范围。");
  } else {
    score -= 3;
    notes.push("曲线说明偏少，建议补充处理法、豆种和风险备注。");
  }

  const processFit = String(profile.process_fit ?? "");
  if (["natural", "washed", "honey", "experimental"].includes(processFit)) {
    score += 5;
    notes.push(`已识别处理法适配：${processFit}。`);
  }

  const rawFieldCount = Object.keys(profile.raw_fields ?? {}).length;
  if (rawFieldCount >= 8) {
    score += 4;
    notes.push("原始字段保留较完整，后续可回写 .kpro。");
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    notes: normalizeNotes(notes).slice(0, 8)
  };
}

function normalizeSnapshot(value: unknown): ProfileTaxonomySnapshot {
  const snapshot = value as Partial<ProfileTaxonomySnapshot> | null | undefined;
  return {
    tagNames: normalizeNameList(snapshot?.tagNames ?? []),
    groupNames: normalizeNameList(snapshot?.groupNames ?? []),
    initialRecommendationScore: normalizeScore(snapshot?.initialRecommendationScore ?? null),
    initialRecommendationNotes: normalizeNotes(snapshot?.initialRecommendationNotes)
  };
}

function normalizeNameList(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const names: string[] = [];
  for (const item of values) {
    const name = String(item ?? "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name.slice(0, 48));
  }
  return names.slice(0, 24);
}

function normalizeNotes(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [];
  return values
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, 12);
}

function normalizeScore(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const score = Number(value);
  if (!Number.isFinite(score)) return null;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function slugifyTaxonomy(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || `tag-${hashString(name)}`;
}

function hashString(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

export async function recordRoastProfileDownload(profileId: string, ownerId?: string | null) {
  const supabase = await requireSupabaseAdmin();
  const { error } = await supabase.from("roast_profile_downloads").insert({
    profile_id: profileId,
    owner_id: ownerId ?? null
  });
  if (error) throw error;
}

export async function listRoastProfileReviews(profileId: string): Promise<RoastProfileReviewRecord[]> {
  const supabase = await requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("roast_profile_reviews")
    .select("id,profile_id,owner_id,rating,body,created_at,updated_at")
    .eq("profile_id", profileId)
    .order("updated_at", { ascending: false })
    .limit(80);
  if (error) throw error;
  return (data ?? []) as unknown as RoastProfileReviewRecord[];
}

export async function upsertRoastProfileReview(input: {
  profileId: string;
  ownerId: string;
  rating: number;
  body: string;
}) {
  const supabase = await requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("roast_profile_reviews")
    .upsert({
      profile_id: input.profileId,
      owner_id: input.ownerId,
      rating: input.rating,
      body: input.body,
      updated_at: new Date().toISOString()
    }, { onConflict: "profile_id,owner_id" })
    .select("id,profile_id,owner_id,rating,body,created_at,updated_at")
    .single();
  if (error) throw error;
  return data as unknown as RoastProfileReviewRecord;
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

export async function scoreUploadCurve(input: {
  ownerId: string;
  uploadId: string;
  baselineKind: "public_profile" | "user_curve";
  baselineId: string;
}) {
  const supabase = await requireSupabaseAdmin();
  const uploadedPoints = await getUploadedTemperaturePoints(supabase, input.ownerId, input.uploadId);
  const baselinePoints = await getBaselineTemperaturePoints(supabase, input.ownerId, input.baselineKind, input.baselineId);
  const result = scoreCurveAgainstReference(uploadedPoints, baselinePoints);

  const { data, error } = await supabase.from("roast_profile_scores").insert({
    owner_id: input.ownerId,
    upload_id: input.uploadId,
    baseline_kind: input.baselineKind,
    baseline_profile_id: input.baselineKind === "public_profile" ? input.baselineId : null,
    baseline_curve_document_id: input.baselineKind === "user_curve" ? input.baselineId : null,
    score: result.score,
    rating: result.rating,
    metrics: result.metrics,
    notes: result.notes
  }).select("id,created_at").single();
  if (error) throw error;
  return { ...result, id: String(data.id), createdAt: String(data.created_at), baselineKind: input.baselineKind };
}

async function getUploadedTemperaturePoints(supabase: SupabaseClient, ownerId: string, uploadId: string): Promise<CurvePoint[]> {
  const { data: upload, error: uploadError } = await supabase
    .from("uploads")
    .select("id,file_kind")
    .eq("id", uploadId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (uploadError) throw uploadError;
  if (!upload) throw new Error("上传记录不存在。");

  const { data: profile, error: profileError } = await supabase
    .from("roast_profiles")
    .select("roast_curve_points")
    .eq("upload_id", uploadId)
    .maybeSingle();
  if (profileError) throw profileError;
  if (Array.isArray(profile?.roast_curve_points) && profile.roast_curve_points.length >= 2) {
    return profile.roast_curve_points as CurvePoint[];
  }

  const { data: log, error: logError } = await supabase
    .from("roast_logs")
    .select("parsed_payload")
    .eq("upload_id", uploadId)
    .maybeSingle();
  if (logError) throw logError;
  const parsed = log?.parsed_payload as KlogParseResult | null | undefined;
  const actualMean = parsed?.samples
    ?.map((sample) => ({ timeSeconds: sample.timeSeconds, value: sample.meanTempC ?? sample.tempC ?? sample.spotTempC ?? NaN }))
    .filter((point) => Number.isFinite(point.value));
  if (actualMean && actualMean.length >= 2) return downsamplePoints(actualMean, 180);

  const targetProfile = parsed?.targetProfile?.roastCurvePoints;
  if (Array.isArray(targetProfile) && targetProfile.length >= 2) return targetProfile;
  throw new Error("这条上传记录没有可评分的温度曲线。请上传 .kpro 或 .klog。");
}

async function getBaselineTemperaturePoints(
  supabase: SupabaseClient,
  ownerId: string,
  baselineKind: "public_profile" | "user_curve",
  baselineId: string
): Promise<CurvePoint[]> {
  if (baselineKind === "public_profile") {
    const { data, error } = await supabase
      .from("roast_profiles")
      .select("roast_curve_points")
      .eq("id", baselineId)
      .or(`visibility.in.(public,unlisted),owner_id.eq.${ownerId}`)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("公开参考曲线不存在。");
    return data.roast_curve_points as CurvePoint[];
  }

  const { data, error } = await supabase
    .from("curve_documents")
    .select("roast_curve_points")
    .eq("id", baselineId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("个人参考曲线不存在。");
  return data.roast_curve_points as CurvePoint[];
}

function downsamplePoints(points: CurvePoint[], maxItems: number) {
  if (points.length <= maxItems) return points;
  const stride = Math.ceil(points.length / maxItems);
  return points.filter((_, index) => index % stride === 0);
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
