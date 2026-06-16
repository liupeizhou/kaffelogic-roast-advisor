import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { PLAN_LIMITS, type PlanCode } from "@/lib/quota";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { planFromGroup } from "@/lib/user-groups";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase 尚未配置。" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const userId = typeof body.userId === "string" ? body.userId : "";
    const planCode = normalizePlanCode(body.planCode ?? body.userGroup);
    const credits = Number(body.credits ?? 0);
    if (!userId) return NextResponse.json({ error: "缺少 userId。" }, { status: 400 });

    if (planCode) {
      const limits = PLAN_LIMITS[planCode];
      const periodEnd = new Date();
      periodEnd.setUTCDate(periodEnd.getUTCDate() + 30);
      const { error } = await supabase.from("user_plans").insert({
        user_id: userId,
        plan_code: planCode,
        status: "active",
        daily_limit: limits.dailyLimit,
        monthly_limit: limits.monthlyLimit,
        price_cny: limits.priceCny,
        provider: "manual",
        current_period_end: periodEnd.toISOString()
      });
      if (error) throw error;
    }

    if (credits > 0) {
      const { error } = await supabase.from("credit_transactions").insert({
        user_id: userId,
        amount: Math.floor(credits),
        reason: "manual_grant",
        provider: "manual",
        metadata: { note: body.note ?? null }
      });
      if (error) throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "手动授权失败。"
    }, { status: 500 });
  }
}

function normalizePlanCode(value: unknown): PlanCode | null {
  if (typeof value === "string") {
    const mapped = planFromGroup(value);
    if (mapped) return mapped;
  }
  return value === "balanced" || value === "pro" || value === "free" ? value : null;
}
