import { NextResponse } from "next/server";
import { requireUserResponse } from "@/lib/auth";
import { serializeKpro } from "@/lib/kpro";
import { getCurveDocument } from "@/lib/roast-persistence";
import type { KproProfile } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, denied } = await requireUserResponse();
  if (denied) return denied;
  const { id } = await params;
  const curve = await getCurveDocument(id, user.id);
  if (!curve) return NextResponse.json({ error: "曲线不存在。" }, { status: 404 });
  const rawFields = curve.raw_fields ?? {};
  const profile: KproProfile = {
    fileName: `${curve.short_name || curve.title}.kpro`,
    shortName: curve.short_name,
    designer: curve.designer,
    description: curve.description,
    schemaVersion: rawFields.profile_schema_version ?? "1.4",
    recommendedLevel: curve.recommended_level,
    expectedFirstCrackTemp: curve.expected_first_crack_temp,
    expectedColourChangeTemp: curve.expected_colour_change_temp,
    roastLevels: curve.roast_levels,
    roastCurvePoints: curve.roast_curve_points,
    fanCurvePoints: curve.fan_curve_points,
    rawFields
  };
  const fileName = `${(curve.short_name || curve.title).replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]+/g, "_")}.kpro`;
  return new NextResponse(serializeKpro(profile), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="${encodeURIComponent(fileName)}"`
    }
  });
}
