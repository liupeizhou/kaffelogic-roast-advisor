import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listRoastProfiles } from "@/lib/roast-persistence";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getCurrentUser();
    const profiles = await listRoastProfiles(120, user?.id);
    return NextResponse.json({
      configured: true,
      profiles
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取曲线库失败。";
    const status = message.includes("Supabase 尚未配置") ? 503 : 500;
    return NextResponse.json({
      configured: false,
      profiles: [],
      error: message
    }, { status });
  }
}
