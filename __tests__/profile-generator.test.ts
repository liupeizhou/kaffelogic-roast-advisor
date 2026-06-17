import { describe, expect, it } from "vitest";
import { defaultProfileGeneratorInput, generateKaffelogicProfile, getGeneratorSafetyNotes } from "@/lib/profile-generator";
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
    expect(reparsed.rawFields.profile_generator).toBe("kaffelogic-roast-advisor-bezier-generator");
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

  it("keeps process milestone nodes explicit for manual curve adjustment", () => {
    const input = defaultProfileGeneratorInput("en");
    const profile = generateKaffelogicProfile(input);
    const times = new Set(profile.roastCurvePoints.map((point) => point.timeSeconds));

    expect(times.has(0)).toBe(true);
    expect(times.has(input.cc.t)).toBe(true);
    expect(times.has(input.fc.t)).toBe(true);
    expect(times.has(input.drop.t)).toBe(true);
    expect(profile.rawFields.generator_adjustment_nodes).toContain("CC");
    expect(profile.rawFields.generator_adjustment_nodes).toContain("FC");
    expect(profile.rawFields.generator_adjustment_nodes).toContain("Drop");
  });

  it("records Nano 7 no-preheat policy and fan-preview safety notes", () => {
    const input = defaultProfileGeneratorInput("zh");
    const profile = generateKaffelogicProfile(input);
    const notes = getGeneratorSafetyNotes(input);

    expect(profile.rawFields.generator_preheat_policy).toContain("no preheat");
    expect(profile.rawFields.generator_fan_preview_required).toBe("true");
    expect(notes.some((note) => note.includes("Fan preview"))).toBe(true);
    expect(notes.some((note) => note.includes("预热"))).toBe(true);
  });

  it("localizes generator safety notes for English editor users", () => {
    const input = defaultProfileGeneratorInput("en");
    const notes = getGeneratorSafetyNotes(input, "en").join(" ");

    expect(notes).toContain("no preheat");
    expect(notes).toContain("Fan preview");
    expect(notes).not.toContain("预热");
  });

  it("warns when fan descent is too aggressive for tracking stability", () => {
    const input = {
      ...defaultProfileGeneratorInput("en"),
      fan: { startRpm: 15000, descentRpm: 13000, descentOffsetSec: 60 }
    };

    expect(getGeneratorSafetyNotes(input).join(" ")).toContain("追温");
  });
});
