import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listRoastProfileLeaderboard } from "@/lib/roast-persistence";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getCurrentUser();
    const profiles = await listRoastProfileLeaderboard(80, user?.id);
    return NextResponse.json({ profiles });
  } catch (error) {
    return NextResponse.json({
      profiles: [],
      error: error instanceof Error ? error.message : "读取曲线排行榜失败。"
    }, { status: 500 });
  }
}
