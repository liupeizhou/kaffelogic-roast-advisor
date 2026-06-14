import { NextResponse } from "next/server";

const ADMIN_HEADER = "x-admin-token";

export function requireAdmin(request: Request): NextResponse | null {
  const configuredToken = process.env.ADMIN_ACCESS_TOKEN?.trim();
  if (!configuredToken && process.env.NODE_ENV !== "production") return null;

  if (!configuredToken) {
    return NextResponse.json({
      error: "生产环境未配置 ADMIN_ACCESS_TOKEN，写操作已禁用。"
    }, { status: 403 });
  }

  const suppliedToken = request.headers.get(ADMIN_HEADER)?.trim()
    || parseBearerToken(request.headers.get("authorization"));

  if (suppliedToken !== configuredToken) {
    return NextResponse.json({
      error: "缺少或错误的管理令牌。"
    }, { status: 401 });
  }

  return null;
}

function parseBearerToken(value: string | null): string {
  if (!value?.startsWith("Bearer ")) return "";
  return value.slice("Bearer ".length).trim();
}
