import { describe, expect, it } from "vitest";
import { fitPath, segmentsToAnchors } from "@/lib/path-fitter";

describe("PathFitter", () => {
  it("fits roast log points into finite Bezier anchors", () => {
    const points = [
      { timeSeconds: 0, value: 32 },
      { timeSeconds: 60, value: 92 },
      { timeSeconds: 130, value: 154 },
      { timeSeconds: 220, value: 184 },
      { timeSeconds: 326, value: 207 },
      { timeSeconds: 415, value: 216.8 }
    ];

    const segments = fitPath(points, 2.5);
    const anchors = segmentsToAnchors(segments);

    expect(segments.length).toBeGreaterThanOrEqual(2);
    expect(anchors[0].position).toEqual(points[0]);
    expect(anchors.at(-1)?.position).toEqual(points.at(-1));

    for (const anchor of anchors) {
      expect(Number.isFinite(anchor.position.timeSeconds)).toBe(true);
      expect(Number.isFinite(anchor.position.value)).toBe(true);
      expect(Number.isFinite(anchor.leftCtrl.timeSeconds)).toBe(true);
      expect(Number.isFinite(anchor.leftCtrl.value)).toBe(true);
      expect(Number.isFinite(anchor.rightCtrl.timeSeconds)).toBe(true);
      expect(Number.isFinite(anchor.rightCtrl.value)).toBe(true);
    }
  });

  it("deduplicates adjacent log samples before fitting", () => {
    const segments = fitPath([
      { timeSeconds: 0, value: 30 },
      { timeSeconds: 0, value: 30 },
      { timeSeconds: 120, value: 150 }
    ]);

    expect(segments).toHaveLength(2);
    expect(segments[0].point).toEqual({ x: 0, y: 30 });
    expect(segments[1].point).toEqual({ x: 120, y: 150 });
  });
});
