import type { BezierAnchor, CurvePoint } from "@/lib/types";

/**
 * Cubic Bezier position (de Casteljau).
 */
export function bezierPosition(
  p0: number, t1: number, t2: number, p3: number, ratio: number
): number {
  const r = 1 - ratio;
  return r ** 3 * p0 + 3 * r ** 2 * ratio * t1 + 3 * r * ratio ** 2 * t2 + ratio ** 3 * p3;
}

/**
 * Cubic Bezier derivative (for ROR).
 */
export function bezierDerivative(
  p0: number, t1: number, t2: number, p3: number, ratio: number
): number {
  const r = 1 - ratio;
  return 3 * r ** 2 * (t1 - p0) + 6 * r * ratio * (t2 - t1) + 3 * ratio ** 2 * (p3 - t2);
}

/**
 * Binary search to find ratio where bezier(Temperature) == target.
 */
export function bezierFindRatio(
  p0: number, t1: number, t2: number, p3: number,
  targetT: number, maxIterations = 36
): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < maxIterations && hi - lo > 1e-9; i += 1) {
    const mid = (lo + hi) / 2;
    if (bezierPosition(p0, t1, t2, p3, mid) < targetT) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

/**
 * Sample Bezier curves from anchors into discrete CurvePoints.
 */
export function sampleBezierAnchors(
  anchors: BezierAnchor[],
  stepSeconds = 15
): { tempPoints: CurvePoint[]; rorPoints: CurvePoint[] } {
  if (anchors.length < 2) return { tempPoints: [], rorPoints: [] };

  const lastTime = anchors.at(-1)!.position.timeSeconds;
  const tempPoints: CurvePoint[] = [];
  const rorPoints: CurvePoint[] = [];

  for (let time = 0; time <= lastTime; time += stepSeconds) {
    const { temp, ror } = bezierAtTime(anchors, time);
    tempPoints.push({ timeSeconds: time, value: round1(temp) });
    rorPoints.push({ timeSeconds: time, value: round1(ror) });
  }

  // always include the final point
  const lastBefore = tempPoints.at(-1)?.timeSeconds ?? -1;
  if (lastBefore < lastTime) {
    const { temp, ror } = bezierAtTime(anchors, lastTime);
    tempPoints.push({ timeSeconds: lastTime, value: round1(temp) });
    rorPoints.push({ timeSeconds: lastTime, value: round1(ror) });
  }

  return { tempPoints, rorPoints };
}

/**
 * Evaluate temperature and ROR at a given time from Bezier anchors.
 */
export function bezierAtTime(anchors: BezierAnchor[], timeSeconds: number): { temp: number; ror: number } {
  if (timeSeconds <= anchors[0].position.timeSeconds) {
    return { temp: anchors[0].position.value, ror: 0 };
  }

  for (let i = 0; i < anchors.length - 1; i += 1) {
    const a = anchors[i];
    const b = anchors[i + 1];
    if (timeSeconds > b.position.timeSeconds && i < anchors.length - 2) continue;

    const duration = b.position.timeSeconds - a.position.timeSeconds;
    const ratio = duration > 0
      ? Math.max(0, Math.min(1, (timeSeconds - a.position.timeSeconds) / duration))
      : 0;

    const t = bezierPosition(
      a.position.value, a.rightCtrl.value, b.leftCtrl.value, b.position.value, ratio
    );

    const dt_dr = bezierDerivative(
      a.position.value, a.rightCtrl.value, b.leftCtrl.value, b.position.value, ratio
    );

    const ror = duration > 0 && Math.abs(dt_dr) > 1e-9
      ? dt_dr / duration * 60
      : 0;

    return { temp: t, ror };
  }

  const last = anchors.at(-1)!;
  return { temp: last.position.value, ror: 0 };
}

/**
 * Interpolate temperature at a specific time from discrete points.
 */
export function interpolateCurve(points: CurvePoint[], timeSeconds: number): number {
  if (!points.length) return 0;
  if (timeSeconds <= points[0].timeSeconds) return points[0].value;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const next = points[i];
    if (timeSeconds <= next.timeSeconds) {
      const ratio = (timeSeconds - prev.timeSeconds) / Math.max(next.timeSeconds - prev.timeSeconds, 1);
      return prev.value + (next.value - prev.value) * ratio;
    }
  }
  return points.at(-1)?.value ?? 0;
}

/**
 * Find the time at which the curve crosses a given temperature.
 */
export function crossingTime(points: CurvePoint[], target: number | null): number | null {
  if (target === null || points.length < 2) return null;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    if (prev.value === target) return prev.timeSeconds;
    if ((prev.value <= target && curr.value >= target) || (prev.value >= target && curr.value <= target)) {
      const span = curr.value - prev.value;
      if (!span) return curr.timeSeconds;
      return Math.round(prev.timeSeconds + ((target - prev.value) / span) * (curr.timeSeconds - prev.timeSeconds));
    }
  }
  return null;
}

/**
 * Build phase metrics (drying / maillard / development) from curve points.
 */
export function buildPhaseMetrics(
  points: CurvePoint[],
  ccTime: number | null,
  fcTime: number | null
): Array<{ key: string; labelZh: string; labelEn: string; startSeconds: number; endSeconds: number; ratio: number | null }> {
  const endSeconds = points.at(-1)?.timeSeconds ?? 0;
  if (!endSeconds) return [];

  const colour = ccTime ?? Math.round(endSeconds * 0.42);
  const fc = fcTime ?? Math.round(endSeconds * 0.78);

  return [
    {
      key: "drying", labelZh: "干燥", labelEn: "Drying",
      startSeconds: 0, endSeconds: Math.min(colour, endSeconds),
      ratio: Math.min(colour, endSeconds) / endSeconds * 100
    },
    {
      key: "maillard", labelZh: "Maillard", labelEn: "Maillard",
      startSeconds: Math.min(colour, endSeconds), endSeconds: Math.min(fc, endSeconds),
      ratio: Math.max(Math.min(fc, endSeconds) - Math.min(colour, endSeconds), 0) / endSeconds * 100
    },
    {
      key: "development", labelZh: "发展", labelEn: "Development",
      startSeconds: Math.min(fc, endSeconds), endSeconds,
      ratio: Math.max(endSeconds - Math.min(fc, endSeconds), 0) / endSeconds * 100
    }
  ];
}

/**
 * Estimate ROR at a given time using a ±15s window.
 */
export function estimateRor(points: CurvePoint[], timeSeconds: number): number {
  const before = interpolateCurve(points, Math.max(0, timeSeconds - 15));
  const after  = interpolateCurve(points, Math.min(points.at(-1)?.timeSeconds ?? timeSeconds, timeSeconds + 15));
  return ((after - before) / 30) * 60;
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
