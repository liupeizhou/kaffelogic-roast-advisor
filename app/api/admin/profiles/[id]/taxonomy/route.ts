import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import {
  applyInitialRecommendationAdmin,
  getProfileTaxonomyAdmin,
  rollbackProfileTaxonomyAdmin,
  updateProfileTaxonomyAdmin
} from "@/lib/roast-persistence";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function getAdminUserId() {
  const adminResponse = await requireAdmin();
  if (adminResponse) return { adminResponse, userId: null };

  const supabase = await createSupabaseServerClient();
  const { data, error } = supabase ? await supabase.auth.getUser() : { data: null, error: new Error("Supabase 登录未配置。") };
  if (error || !data?.user?.id) {
    return {
      adminResponse: NextResponse.json({ error: "请先登录管理员账号。" }, { status: 401 }),
      userId: null
    };
  }
  return { adminResponse: null, userId: data.user.id };
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const { adminResponse } = await getAdminUserId();
  if (adminResponse) return adminResponse;

  try {
    return NextResponse.json(await getProfileTaxonomyAdmin(id));
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "读取曲线分类失败。"
    }, { status: 500 });
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const { adminResponse, userId } = await getAdminUserId();
  if (adminResponse) return adminResponse;

  try {
    const body = await request.json() as {
      tagNames?: string[];
      groupNames?: string[];
      initialScore?: number | null;
      initialNotes?: string[];
      note?: string | null;
    };
    const payload = await updateProfileTaxonomyAdmin({
      profileId: id,
      actorId: userId!,
      tagNames: body.tagNames ?? [],
      groupNames: body.groupNames ?? [],
      initialScore: body.initialScore ?? null,
      initialNotes: body.initialNotes ?? [],
      note: body.note ?? null
    });
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "保存曲线分类失败。"
    }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const { adminResponse, userId } = await getAdminUserId();
  if (adminResponse) return adminResponse;

  try {
    const body = await request.json() as { action?: string; changeId?: string };
    if (body.action === "recommend") {
      return NextResponse.json(await applyInitialRecommendationAdmin({ profileId: id, actorId: userId! }));
    }
    if (body.action === "rollback" && body.changeId) {
      return NextResponse.json(await rollbackProfileTaxonomyAdmin({
        profileId: id,
        actorId: userId!,
        changeId: body.changeId
      }));
    }
    return NextResponse.json({ error: "未知操作。" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "执行曲线管理操作失败。"
    }, { status: 500 });
  }
}
