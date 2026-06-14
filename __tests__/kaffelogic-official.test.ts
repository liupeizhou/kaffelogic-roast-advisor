import { describe, expect, it } from "vitest";
import { getOfficialProfileInsight } from "@/lib/kaffelogic-official";

describe("getOfficialProfileInsight", () => {
  it("detects official profile family from name and processing cues", () => {
    const insight = getOfficialProfileInsight({
      name: "Modified KL Natural",
      description: "Natural process starter profile",
      processFit: "natural",
      expectedColourChangeTemp: 168,
      expectedFirstCrackTemp: 203,
      roastCurvePoints: [
        { timeSeconds: 0, value: 24 },
        { timeSeconds: 120, value: 130 },
        { timeSeconds: 250, value: 168 },
        { timeSeconds: 430, value: 203 },
        { timeSeconds: 590, value: 218 }
      ]
    });

    expect(insight.family?.key).toBe("washed-natural");
    expect(insight.colourChangeSeconds).toBe(250);
    expect(insight.firstCrackSeconds).toBe(430);
    expect(insight.developmentRatio).toBeCloseTo(27.1, 1);
    expect(insight.phaseMetrics).toHaveLength(3);
  });
});
