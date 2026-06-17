import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { canWriteRuntimeConfig, getPublicRuntimeConfig, updateRuntimeConfig } from "@/lib/runtime-config";

export const runtime = "nodejs";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return NextResponse.json(await getPublicRuntimeConfig());
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  if (!canWriteRuntimeConfig()) {
    return NextResponse.json({
      error: "生产环境不允许从后台写入 API Key。请在 Vercel/Supabase 环境变量中修改配置。"
    }, { status: 403 });
  }

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
