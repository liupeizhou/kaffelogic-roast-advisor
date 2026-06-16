import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/user-groups";

export async function requireAdmin(): Promise<NextResponse | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase 登录未配置。" }, { status: 503 });
  }

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email) {
    return NextResponse.json({ error: "请先登录管理员账号。" }, { status: 401 });
  }

  if (!isAdminEmail(data.user.email)) {
    return NextResponse.json({ error: "当前邮箱不在管理员邮件列表中。" }, { status: 403 });
  }

  return null;
}
