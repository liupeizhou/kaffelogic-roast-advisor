import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type RuntimeConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  supabaseUploadBucket: string;
  aiProvider: "openai" | "siliconflow" | "custom";
  aiBaseUrl: string;
  aiApiKey: string;
  aiTextModel: string;
  aiVisionModel: string;
};

export type PublicRuntimeConfig = Omit<RuntimeConfig, "supabaseAnonKey" | "supabaseServiceRoleKey" | "aiApiKey"> & {
  supabaseAnonKeySet: boolean;
  supabaseServiceRoleKeySet: boolean;
  aiApiKeySet: boolean;
};

const ENV_FILE = ".env.local";
const CONFIG_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SITE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_UPLOAD_BUCKET",
  "AI_PROVIDER",
  "AI_BASE_URL",
  "AI_API_KEY",
  "AI_TEXT_MODEL",
  "AI_VISION_MODEL",
  "ADMIN_ACCESS_TOKEN",
  "OPENAI_API_KEY",
  "OPENAI_VISION_MODEL"
] as const;

export async function getRuntimeConfig(): Promise<RuntimeConfig> {
  const fileValues = await readEnvFile();
  return configFromValues(fileValues);
}

export async function getPublicRuntimeConfig(): Promise<PublicRuntimeConfig> {
  const config = await getRuntimeConfig();
  return {
    supabaseUrl: config.supabaseUrl,
    supabaseAnonKeySet: Boolean(config.supabaseAnonKey),
    supabaseServiceRoleKeySet: Boolean(config.supabaseServiceRoleKey),
    supabaseUploadBucket: config.supabaseUploadBucket,
    aiProvider: config.aiProvider,
    aiBaseUrl: config.aiBaseUrl,
    aiApiKeySet: Boolean(config.aiApiKey),
    aiTextModel: config.aiTextModel,
    aiVisionModel: config.aiVisionModel
  };
}

export async function updateRuntimeConfig(input: Partial<Record<string, string>>) {
  const current = await readEnvFile();
  const next = { ...current };

  setIfPresent(next, "NEXT_PUBLIC_SUPABASE_URL", input.supabaseUrl);
  setIfPresent(next, "NEXT_PUBLIC_SUPABASE_ANON_KEY", input.supabaseAnonKey, true);
  setIfPresent(next, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", input.supabaseAnonKey, true);
  setIfPresent(next, "SUPABASE_SERVICE_ROLE_KEY", input.supabaseServiceRoleKey, true);
  setIfPresent(next, "SUPABASE_UPLOAD_BUCKET", input.supabaseUploadBucket);
  setIfPresent(next, "AI_PROVIDER", input.aiProvider);
  setIfPresent(next, "AI_BASE_URL", input.aiBaseUrl);
  setIfPresent(next, "AI_API_KEY", input.aiApiKey, true);
  setIfPresent(next, "AI_TEXT_MODEL", input.aiTextModel);
  setIfPresent(next, "AI_VISION_MODEL", input.aiVisionModel);

  if (input.aiApiKey && !input.openAiApiKey) {
    next.OPENAI_API_KEY = input.aiApiKey;
  }
  if (input.aiVisionModel && !input.openAiVisionModel) {
    next.OPENAI_VISION_MODEL = input.aiVisionModel;
  }

  await writeEnvFile(next);
  return getPublicRuntimeConfig();
}

export function configSignature(config: RuntimeConfig): string {
  return [
    config.supabaseUrl,
    config.supabaseServiceRoleKey ? "service-key" : "no-service-key",
    config.supabaseUploadBucket
  ].join("|");
}

function configFromValues(values: Record<string, string>): RuntimeConfig {
  const aiProvider = normalizeProvider(values.AI_PROVIDER);
  return {
    supabaseUrl: values.NEXT_PUBLIC_SUPABASE_URL ?? "",
    supabaseAnonKey: values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || values.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    supabaseServiceRoleKey: values.SUPABASE_SERVICE_ROLE_KEY ?? "",
    supabaseUploadBucket: values.SUPABASE_UPLOAD_BUCKET || "kaffelogic-uploads",
    aiProvider,
    aiBaseUrl: values.AI_BASE_URL || (aiProvider === "siliconflow" ? "https://api.siliconflow.cn/v1" : "https://api.openai.com/v1"),
    aiApiKey: values.AI_API_KEY || values.OPENAI_API_KEY || "",
    aiTextModel: values.AI_TEXT_MODEL || (aiProvider === "siliconflow" ? "Qwen/Qwen3-32B" : "gpt-4.1-mini"),
    aiVisionModel: values.AI_VISION_MODEL || values.OPENAI_VISION_MODEL || (aiProvider === "siliconflow" ? "Qwen/Qwen2.5-VL-72B-Instruct" : "gpt-4.1-mini")
  };
}

async function readEnvFile(): Promise<Record<string, string>> {
  const values: Record<string, string> = {};
  Object.assign(values, process.env);
  const path = join(process.cwd(), ENV_FILE);
  if (!existsSync(path)) return values;

  const text = await readFile(path, "utf8");
  Object.assign(values, parseEnv(text));
  return values;
}

function parseEnv(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

async function writeEnvFile(values: Record<string, string>) {
  const keptKeys = Object.keys(values)
    .filter((key) => CONFIG_KEYS.includes(key as (typeof CONFIG_KEYS)[number]))
    .sort();
  const lines = [
    "# Local runtime config generated by Kaffelogic Roast Advisor.",
    "# Do not commit this file.",
    ...keptKeys.map((key) => `${key}=${quoteEnv(values[key] ?? "")}`)
  ];
  await writeFile(join(process.cwd(), ENV_FILE), `${lines.join("\n")}\n`, "utf8");
}

function quoteEnv(value: string): string {
  if (!value) return "";
  return JSON.stringify(value);
}

function setIfPresent(target: Record<string, string>, key: string, value: unknown, secret = false) {
  if (typeof value !== "string") return;
  if (secret && value.trim() === "") return;
  target[key] = value.trim();
}

function normalizeProvider(value?: string): RuntimeConfig["aiProvider"] {
  if (value === "openai" || value === "siliconflow" || value === "custom") return value;
  return "siliconflow";
}
