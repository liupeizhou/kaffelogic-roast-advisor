import { NextResponse } from "next/server";
import { requireUserResponse } from "@/lib/auth";
import { getQuotaSnapshot } from "@/lib/quota";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function GET() {
  const { user, denied } = await requireUserResponse();
  if (denied) return denied;
  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase 尚未配置。" }, { status: 503 });
  }
  const quotaSnapshot = await getQuotaSnapshot(supabase, user.id);
  return NextResponse.json({ user: { id: user.id, email: user.email }, quotaSnapshot });
}
