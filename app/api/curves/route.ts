import { NextResponse } from "next/server";
import { requireUserResponse } from "@/lib/auth";
import { parseKpro } from "@/lib/kpro";
import { listCurveDocuments, saveCurveDocument } from "@/lib/roast-persistence";
import type { KproProfile } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  const { user, denied } = await requireUserResponse();
  if (denied) return denied;
  try {
    const curves = await listCurveDocuments(user.id);
    return NextResponse.json({ curves });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "读取曲线失败。" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { user, denied } = await requireUserResponse();
  if (denied) return denied;
  try {
    const body = await request.json();
    const profile = normalizeProfile(body.profile);
    const document = await saveCurveDocument({
      ownerId: user.id,
      id: typeof body.id === "string" ? body.id : null,
      profile,
      visibility: body.visibility === "public" || body.visibility === "unlisted" ? body.visibility : "private"
    });
    return NextResponse.json({ curve: document });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "保存曲线失败。" }, { status: 500 });
  }
}

function normalizeProfile(value: unknown): KproProfile {
  if (typeof value === "string") return parseKpro(value);
  const profile = value as Partial<KproProfile> | null;
  if (!profile) throw new Error("缺少曲线数据。");
  return {
    fileName: profile.fileName || `${profile.shortName || "edited-profile"}.kpro`,
    shortName: profile.shortName ?? null,
    designer: profile.designer ?? null,
    description: profile.description ?? null,
    schemaVersion: profile.schemaVersion ?? profile.rawFields?.profile_schema_version ?? "1.4",
    recommendedLevel: normalizeNumber(profile.recommendedLevel),
    expectedFirstCrackTemp: normalizeNumber(profile.expectedFirstCrackTemp),
    expectedColourChangeTemp: normalizeNumber(profile.expectedColourChangeTemp),
    roastLevels: Array.isArray(profile.roastLevels) ? profile.roastLevels.map(Number).filter(Number.isFinite) : [],
    roastCurvePoints: Array.isArray(profile.roastCurvePoints) ? profile.roastCurvePoints.map(normalizePoint).filter(Boolean) as KproProfile["roastCurvePoints"] : [],
    fanCurvePoints: Array.isArray(profile.fanCurvePoints) ? profile.fanCurvePoints.map(normalizePoint).filter(Boolean) as KproProfile["fanCurvePoints"] : [],
    rawFields: typeof profile.rawFields === "object" && profile.rawFields ? profile.rawFields as Record<string, string> : {}
  };
}

function normalizeNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePoint(value: unknown) {
  const point = value as { timeSeconds?: unknown; value?: unknown } | null;
  const timeSeconds = Number(point?.timeSeconds);
  const nextValue = Number(point?.value);
  if (!Number.isFinite(timeSeconds) || !Number.isFinite(nextValue)) return null;
  return { timeSeconds, value: nextValue };
}
