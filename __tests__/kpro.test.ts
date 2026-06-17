import { describe, expect, it } from "vitest";
import { detectKpro, filterEditorFields, parseKpro, serializeKpro } from "@/lib/kpro";

const SAMPLE_KPRO = `profile_short_name:Geisha Washed
profile_designer:C Lab Roastery Ltd.
profile_description:Santander No.1 Geisha Washed Profile:\\v\\vRecommended Levels:\\vClean: Level 2.0
profile_schema_version:1.4
recommended_level:2.5
expect_fc:204.0
expect_colrchange:170.0
roast_levels:204.0,207.0,210.0,215.0,220.0,225.0,230.0
roast_profile:0.0,20.0,60.0,105.0,180.0,150.0,360.0,204.0,630.9,221.6
fan_profile:0.0,14700.0,60.0,14500.0,300.0,13500.0
`;

describe("parseKpro", () => {
  it("extracts metadata and curve points from a Kaffelogic profile", () => {
    const parsed = parseKpro(SAMPLE_KPRO, "Geisha_Washed.kpro");

    expect(parsed.shortName).toBe("Geisha Washed");
    expect(parsed.designer).toBe("C Lab Roastery Ltd.");
    expect(parsed.description).toContain("Recommended Levels");
    expect(parsed.recommendedLevel).toBe(2.5);
    expect(parsed.expectedFirstCrackTemp).toBe(204);
    expect(parsed.expectedColourChangeTemp).toBe(170);
    expect(parsed.roastLevels).toHaveLength(7);
    expect(parsed.roastCurvePoints.length).toBeGreaterThan(3);
    expect(parsed.fanCurvePoints.length).toBeGreaterThan(2);
  });

  it("detects kpro content even if the extension is missing", () => {
    expect(detectKpro("profile.txt", SAMPLE_KPRO)).toBe(true);
  });

  it("serializes edited profiles without losing raw fields", () => {
    const parsed = parseKpro(SAMPLE_KPRO, "Geisha_Washed.kpro");
    const serialized = serializeKpro({
      ...parsed,
      shortName: "Edited Geisha",
      recommendedLevel: 3.1,
      rawFields: { ...parsed.rawFields, custom_note: "keep me" }
    });
    const reparsed = parseKpro(serialized, "Edited.kpro");

    expect(reparsed.shortName).toBe("Edited Geisha");
    expect(reparsed.recommendedLevel).toBe(3.1);
    expect(reparsed.rawFields.custom_note).toBe("keep me");
    expect(reparsed.roastCurvePoints.length).toBe(parsed.roastCurvePoints.length);
  });

  it("skips malformed curve pairs without shifting subsequent time/value pairs", () => {
    const parsed = parseKpro(`profile_short_name:Bad Pair
roast_profile:0,20,60,9999,120,150
fan_profile:0,14000
`, "bad.kpro");

    expect(parsed.roastCurvePoints).toEqual([
      { timeSeconds: 0, value: 20 },
      { timeSeconds: 120, value: 150 }
    ]);
  });

  it("classifies raw kpro fields for the editor panel", () => {
    const groups = filterEditorFields({
      profile_short_name: "Display me",
      recommended_level: "3.2",
      expect_fc: "204.0",
      zone1_boost: "1.1",
      first_crack: "405",
      custom_parameter: "keep"
    });

    expect(groups.metadata).toEqual({ profile_short_name: "Display me" });
    expect(groups.phases).toMatchObject({ recommended_level: "3.2", expect_fc: "204.0" });
    expect(groups.controls).toEqual({ zone1_boost: "1.1" });
    expect(groups.internal).toEqual({ custom_parameter: "keep" });
    expect(groups.internal.first_crack).toBeUndefined();
  });
});
