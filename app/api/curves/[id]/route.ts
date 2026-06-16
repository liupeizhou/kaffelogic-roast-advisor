import { NextResponse } from "next/server";
import { requireUserResponse } from "@/lib/auth";
import { getCurveDocument, saveCurveDocument } from "@/lib/roast-persistence";
import type { KproProfile } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, denied } = await requireUserResponse();
  if (denied) return denied;
  const { id } = await params;
  try {
    const curve = await getCurveDocument(id, user.id);
    if (!curve) return NextResponse.json({ error: "曲线不存在。" }, { status: 404 });
    return NextResponse.json({ curve });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "读取曲线失败。" }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, denied } = await requireUserResponse();
  if (denied) return denied;
  const { id } = await params;
  try {
    const body = await request.json();
    const profile = body.profile as KproProfile;
    if (!profile.shortName?.trim()) throw new Error("曲线名字必填。");
    const curve = await saveCurveDocument({ ownerId: user.id, id, profile, visibility: body.visibility ?? "private" });
    return NextResponse.json({ curve });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "保存曲线失败。" }, { status: 500 });
  }
}
