import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { configSignature, getRuntimeConfig } from "@/lib/runtime-config";

let cachedClient: SupabaseClient | null = null;
let cachedSignature = "";

export async function getSupabaseAdmin(): Promise<SupabaseClient | null> {
  const config = await getRuntimeConfig();
  const url = config.supabaseUrl;
  const serviceRoleKey = config.supabaseServiceRoleKey;
  const signature = configSignature(config);

  if (!url || !serviceRoleKey) return null;
  if (!cachedClient || cachedSignature !== signature) {
    cachedClient = createClient(url, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
    cachedSignature = signature;
  }
  return cachedClient;
}

export async function getUploadBucket(): Promise<string> {
  const config = await getRuntimeConfig();
  return config.supabaseUploadBucket;
}
