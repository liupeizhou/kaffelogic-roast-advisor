import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}

export async function requireUserResponse(): Promise<{ user: User; denied: null } | { user: null; denied: NextResponse }> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      user: null,
      denied: NextResponse.json({ error: "请先登录后再继续操作。" }, { status: 401 })
    };
  }
  return { user, denied: null };
}
