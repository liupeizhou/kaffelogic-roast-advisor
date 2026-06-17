import { describe, expect, it } from "vitest";
import { defaultProfileGeneratorInput, generateKaffelogicProfile } from "@/lib/profile-generator";
import { parseKpro, serializeKpro } from "@/lib/kpro";

describe("generateKaffelogicProfile", () => {
  it("generates a serializable Kaffelogic profile from milestone targets", () => {
    const input = defaultProfileGeneratorInput("en");
    const profile = generateKaffelogicProfile(input);
    const reparsed = parseKpro(serializeKpro(profile), "generated.kpro");

    expect(profile.shortName).toBe("Target Generated Profile");
    expect(profile.expectedColourChangeTemp).toBe(input.cc.T);
    expect(profile.expectedFirstCrackTemp).toBe(input.fc.T);
    expect(profile.recommendedLevel).toBeGreaterThan(0);
    expect(profile.roastCurvePoints.length).toBeGreaterThan(20);
    expect(profile.fanCurvePoints.length).toBeGreaterThanOrEqual(4);
    expect(reparsed.roastCurvePoints.length).toBe(profile.roastCurvePoints.length);
    expect(reparsed.rawFields.profile_generator).toBe("kaffelogic-roast-advisor-target-generator");
  });

  it("keeps the generated temperature curve monotonic through drop", () => {
    const profile = generateKaffelogicProfile(defaultProfileGeneratorInput("zh"));

    for (let index = 1; index < profile.roastCurvePoints.length; index += 1) {
      expect(profile.roastCurvePoints[index].timeSeconds).toBeGreaterThan(profile.roastCurvePoints[index - 1].timeSeconds);
      expect(profile.roastCurvePoints[index].value).toBeGreaterThanOrEqual(profile.roastCurvePoints[index - 1].value);
    }
    expect(profile.roastCurvePoints.at(-1)).toMatchObject({ timeSeconds: 415, value: 216.8 });
  });

  it("rejects target times that do not follow CC, FC and Drop order", () => {
    const input = defaultProfileGeneratorInput("en");
    expect(() => generateKaffelogicProfile({
      ...input,
      fc: { ...input.fc, t: input.cc.t - 5 }
    })).toThrow("Target times");
  });
});
