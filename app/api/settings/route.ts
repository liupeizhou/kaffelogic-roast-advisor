import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getPublicRuntimeConfig, updateRuntimeConfig } from "@/lib/runtime-config";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await getPublicRuntimeConfig());
}

export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    const body = await request.json();
    const config = await updateRuntimeConfig(body);
    return NextResponse.json(config);
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "保存配置失败。"
    }, { status: 500 });
  }
}
