import { NextResponse } from "next/server";
import { getCurrentUser, requireUserResponse } from "@/lib/auth";
import { getQuotaSnapshot } from "@/lib/quota";
import { getRoastProfile, listRoastProfileReviews, upsertRoastProfileReview } from "@/lib/roast-persistence";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const user = await getCurrentUser();
    const profile = await getRoastProfile(id, user?.id);
    if (!profile) return NextResponse.json({ error: "曲线不存在或不可访问。" }, { status: 404 });
    const reviews = await listRoastProfileReviews(id);
    return NextResponse.json({ reviews });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "读取评论失败。" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, denied } = await requireUserResponse();
  if (denied) return denied;
  const { id } = await params;
  const supabase = await getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase 尚未配置。" }, { status: 503 });

  try {
    const quota = await getQuotaSnapshot(supabase, user.id, new Date(), user.email);
    if (quota.userGroup === "free") {
      return NextResponse.json({ error: "评论功能仅对标准/高级订阅用户和管理组开放。" }, { status: 403 });
    }
    const profile = await getRoastProfile(id, user.id);
    if (!profile) return NextResponse.json({ error: "曲线不存在或不可访问。" }, { status: 404 });
    const body = await request.json();
    const rating = Math.max(1, Math.min(5, Math.round(Number(body.rating ?? 0))));
    const text = typeof body.body === "string" ? body.body.trim().slice(0, 800) : "";
    if (!rating) return NextResponse.json({ error: "评分必须为 1-5。" }, { status: 400 });
    const review = await upsertRoastProfileReview({
      profileId: id,
      ownerId: user.id,
      rating,
      body: text
    });
    return NextResponse.json({ review });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "保存评论失败。" }, { status: 500 });
  }
}
