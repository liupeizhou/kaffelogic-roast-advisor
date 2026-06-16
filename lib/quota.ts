import type { SupabaseClient } from "@supabase/supabase-js";
import { groupFromPlan, type UserGroupCode } from "@/lib/user-groups";

export type PlanCode = "free" | "balanced" | "pro";
export type ChargeSource = "subscription" | "credits" | "free" | "none";

export type QuotaSnapshot = {
  planCode: PlanCode;
  userGroup: UserGroupCode;
  dailyLimit: number;
  monthlyLimit: number;
  dailyUsed: number;
  monthlyUsed: number;
  dailyRemaining: number;
  monthlyRemaining: number;
  freeDailyLimit: number;
  freeDailyUsed: number;
  freeDailyRemaining: number;
  creditBalance: number;
  usageDay: string;
  usageMonth: string;
  nextChargeSource: ChargeSource;
  canAnalyze: boolean;
};

export const PLAN_LIMITS: Record<PlanCode, { dailyLimit: number; monthlyLimit: number; priceCny: number }> = {
  free: { dailyLimit: 3, monthlyLimit: 90, priceCny: 0 },
  balanced: { dailyLimit: 10, monthlyLimit: 300, priceCny: 39.9 },
  pro: { dailyLimit: 100, monthlyLimit: 3000, priceCny: 199 }
};

export function getShanghaiUsageWindow(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return {
    usageDay: `${year}-${month}-${day}`,
    usageMonth: `${year}-${month}`
  };
}

export async function getQuotaSnapshot(supabase: SupabaseClient, userId: string, now = new Date(), email?: string | null): Promise<QuotaSnapshot> {
  const { usageDay, usageMonth } = getShanghaiUsageWindow(now);
  const plan = await getActivePlan(supabase, userId);
  const planLimits = PLAN_LIMITS[plan];
  const [dailyUsed, monthlyUsed, freeDailyUsed, creditBalance] = await Promise.all([
    countUsage(supabase, userId, usageDay, null, "day"),
    countUsage(supabase, userId, null, usageMonth, "month"),
    countUsage(supabase, userId, usageDay, null, "day", "free"),
    getCreditBalance(supabase, userId)
  ]);
  const dailyRemaining = Math.max(planLimits.dailyLimit - dailyUsed, 0);
  const monthlyRemaining = Math.max(planLimits.monthlyLimit - monthlyUsed, 0);
  const freeDailyRemaining = Math.max(PLAN_LIMITS.free.dailyLimit - freeDailyUsed, 0);
  const nextChargeSource = chooseChargeSource({
    planCode: plan,
    dailyRemaining,
    monthlyRemaining,
    freeDailyRemaining,
    creditBalance
  });

  return {
    planCode: plan,
    userGroup: groupFromPlan(plan, email),
    dailyLimit: planLimits.dailyLimit,
    monthlyLimit: planLimits.monthlyLimit,
    dailyUsed,
    monthlyUsed,
    dailyRemaining,
    monthlyRemaining,
    freeDailyLimit: PLAN_LIMITS.free.dailyLimit,
    freeDailyUsed,
    freeDailyRemaining,
    creditBalance,
    usageDay,
    usageMonth,
    nextChargeSource,
    canAnalyze: nextChargeSource !== "none"
  };
}

export async function chargeSuccessfulAnalysis(input: {
  supabase: SupabaseClient;
  userId: string;
  uploadId: string | null;
  metadata?: Record<string, unknown>;
}) {
  const rpcSnapshot = await chargeWithRpc(input);
  if (rpcSnapshot) return rpcSnapshot;

  const snapshot = await getQuotaSnapshot(input.supabase, input.userId);
  if (!snapshot.canAnalyze || snapshot.nextChargeSource === "none") {
    throw new Error("今日或本月额度已用尽，请订阅或充值按量次数。");
  }

  const { error } = await input.supabase.from("usage_events").insert({
    user_id: input.userId,
    upload_id: input.uploadId,
    event_type: "upload_analysis",
    status: "charged",
    charge_source: snapshot.nextChargeSource,
    units: 1,
    usage_day: snapshot.usageDay,
    usage_month: snapshot.usageMonth,
    metadata: input.metadata ?? {}
  });
  if (error) throw error;

  if (snapshot.nextChargeSource === "credits") {
    const { error: creditError } = await input.supabase.from("credit_transactions").insert({
      user_id: input.userId,
      amount: -1,
      reason: "upload_analysis",
      provider: "manual",
      metadata: { uploadId: input.uploadId, ...(input.metadata ?? {}) }
    });
    if (creditError) throw creditError;
  }

  return getQuotaSnapshot(input.supabase, input.userId);
}

async function chargeWithRpc(input: {
  supabase: SupabaseClient;
  userId: string;
  uploadId: string | null;
  metadata?: Record<string, unknown>;
}): Promise<QuotaSnapshot | null> {
  const { data, error } = await input.supabase.rpc("charge_upload_analysis", {
    p_user_id: input.userId,
    p_upload_id: input.uploadId,
    p_metadata: input.metadata ?? {}
  });
  if (error) {
    if (error.code === "PGRST202" || error.message.includes("charge_upload_analysis")) return null;
    throw error;
  }
  return normalizeQuotaSnapshot(data);
}

function chooseChargeSource(input: {
  planCode: PlanCode;
  dailyRemaining: number;
  monthlyRemaining: number;
  freeDailyRemaining: number;
  creditBalance: number;
}): ChargeSource {
  if (input.planCode !== "free" && input.dailyRemaining > 0 && input.monthlyRemaining > 0) return "subscription";
  if (input.creditBalance > 0) return "credits";
  if (input.freeDailyRemaining > 0) return "free";
  return "none";
}

async function getActivePlan(supabase: SupabaseClient, userId: string): Promise<PlanCode> {
  const { data, error } = await supabase
    .from("user_plans")
    .select("plan_code,current_period_end")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  const plan = data?.[0];
  if (!plan) return "free";
  if (plan.current_period_end && new Date(plan.current_period_end).getTime() < Date.now()) return "free";
  return plan.plan_code === "balanced" || plan.plan_code === "pro" ? plan.plan_code : "free";
}

async function countUsage(
  supabase: SupabaseClient,
  userId: string,
  usageDay: string | null,
  usageMonth: string | null,
  mode: "day" | "month",
  chargeSource?: ChargeSource
) {
  let query = supabase
    .from("usage_events")
    .select("units", { count: "exact", head: false })
    .eq("user_id", userId)
    .eq("status", "charged");
  query = mode === "day" ? query.eq("usage_day", usageDay) : query.eq("usage_month", usageMonth);
  if (chargeSource) query = query.eq("charge_source", chargeSource);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).reduce((sum, row) => sum + Number(row.units ?? 0), 0);
}

async function getCreditBalance(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await supabase
    .from("credit_transactions")
    .select("amount")
    .eq("user_id", userId);
  if (error) throw error;
  return Math.max((data ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0), 0);
}

function normalizeQuotaSnapshot(value: unknown): QuotaSnapshot {
  const source = (value ?? {}) as Partial<Record<keyof QuotaSnapshot, unknown>>;
  const planCode = source.planCode === "balanced" || source.planCode === "pro" ? source.planCode : "free";
  const nextChargeSource = source.nextChargeSource === "subscription" || source.nextChargeSource === "credits" || source.nextChargeSource === "free"
    ? source.nextChargeSource
    : "none";
  return {
    planCode,
    userGroup: groupFromPlan(planCode),
    dailyLimit: toNumber(source.dailyLimit),
    monthlyLimit: toNumber(source.monthlyLimit),
    dailyUsed: toNumber(source.dailyUsed),
    monthlyUsed: toNumber(source.monthlyUsed),
    dailyRemaining: toNumber(source.dailyRemaining),
    monthlyRemaining: toNumber(source.monthlyRemaining),
    freeDailyLimit: toNumber(source.freeDailyLimit),
    freeDailyUsed: toNumber(source.freeDailyUsed),
    freeDailyRemaining: toNumber(source.freeDailyRemaining),
    creditBalance: toNumber(source.creditBalance),
    usageDay: typeof source.usageDay === "string" ? source.usageDay : "",
    usageMonth: typeof source.usageMonth === "string" ? source.usageMonth : "",
    nextChargeSource,
    canAnalyze: Boolean(source.canAnalyze)
  };
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
