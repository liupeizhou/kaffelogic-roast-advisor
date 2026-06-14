import { NextResponse } from "next/server";
import { requireUserResponse } from "@/lib/auth";
import { normalizeAnalysis } from "@/lib/diagnostics";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { user, denied } = await requireUserResponse();
  if (denied) return denied;

  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase 未配置，无法保存人工确认结果。" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const uploadId = typeof body.uploadId === "string" ? body.uploadId : null;
    if (!uploadId) {
      return NextResponse.json({ error: "缺少 uploadId。" }, { status: 400 });
    }

    const confirmedAnalysis = normalizeAnalysis(body.confirmedAnalysis);
    const { error } = await supabase
      .from("roast_logs")
      .update({
        confirmed_analysis: { ...confirmedAnalysis, needsReview: false },
        user_corrections: body.userCorrections ?? null,
        needs_review: false,
        parse_status: "parsed"
      })
      .eq("upload_id", uploadId)
      .eq("owner_id", user.id);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "保存确认结果失败。"
    }, { status: 500 });
  }
}
