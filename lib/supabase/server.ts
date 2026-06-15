import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getRuntimeConfig } from "@/lib/runtime-config";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const config = await getRuntimeConfig();
  const url = config.supabaseUrl;
  const key = config.supabaseAnonKey;
  if (!url || !key) return null;

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot write cookies. Middleware refreshes sessions.
        }
      }
    }
  });
}
