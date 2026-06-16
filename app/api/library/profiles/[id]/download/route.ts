import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { serializeKpro } from "@/lib/kpro";
import { getRoastProfile, recordRoastProfileDownload } from "@/lib/roast-persistence";
import type { KproProfile } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const { id } = await params;
  const profile = await getRoastProfile(id, user?.id);
  if (!profile) return NextResponse.json({ error: "曲线不存在或不可访问。" }, { status: 404 });
  await recordRoastProfileDownload(profile.id, user?.id);
  const kpro: KproProfile = {
    fileName: profile.file_name,
    shortName: profile.short_name,
    designer: profile.designer,
    description: profile.description,
    schemaVersion: profile.raw_fields?.profile_schema_version ?? "1.4",
    recommendedLevel: profile.recommended_level,
    expectedFirstCrackTemp: profile.expected_first_crack_temp,
    expectedColourChangeTemp: profile.expected_colour_change_temp,
    roastLevels: profile.roast_levels,
    roastCurvePoints: profile.roast_curve_points,
    fanCurvePoints: profile.fan_curve_points,
    rawFields: profile.raw_fields ?? {}
  };
  const fileName = `${(profile.short_name || profile.display_name || profile.file_name).replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]+/g, "_")}.kpro`;
  return new NextResponse(serializeKpro(kpro), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="${encodeURIComponent(fileName)}"`
    }
  });
}
