import { NextResponse } from "next/server";
import { requireUserResponse } from "@/lib/auth";
import { listUploadHistory } from "@/lib/roast-persistence";

export const runtime = "nodejs";

export async function GET() {
  const { user, denied } = await requireUserResponse();
  if (denied) return denied;
  try {
    const history = await listUploadHistory(user.id, 40);
    return NextResponse.json({ history });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "读取上传历史失败。"
    }, { status: 500 });
  }
}
