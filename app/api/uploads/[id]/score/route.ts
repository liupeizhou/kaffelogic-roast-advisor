import { NextResponse } from "next/server";
import { requireUserResponse } from "@/lib/auth";
import { scoreUploadCurve } from "@/lib/roast-persistence";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, denied } = await requireUserResponse();
  if (denied) return denied;
  const { id } = await params;

  try {
    const body = await request.json();
    const baselineKind = body.baselineKind === "user_curve" ? "user_curve" : "public_profile";
    const baselineId = typeof body.baselineId === "string" ? body.baselineId : "";
    if (!baselineId) {
      return NextResponse.json({ error: "请选择一条参考曲线。" }, { status: 400 });
    }
    const score = await scoreUploadCurve({
      ownerId: user.id,
      uploadId: id,
      baselineKind,
      baselineId
    });
    return NextResponse.json({ score });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "曲线评分失败。"
    }, { status: 500 });
  }
}
