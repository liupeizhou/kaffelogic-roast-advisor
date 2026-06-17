import type { CurvePoint, ProfileOrientation } from "@/lib/types";
import { crossingTime, estimateRor, interpolateCurve } from "@/lib/curve-bezier";

export type CurveRadarMetric = {
  key: "finish" | "stability" | "development" | "fan" | "duration" | "density" | "dtr";
  labelZh: string;
  labelEn: string;
  value: number;
  referenceZone: [number, number];
};

const ORIENTATION_SCALES: Record<ProfileOrientation, {
  finish: [number, number];
  dtr: [number, number];
  duration: [number, number];
}> = {
  Filter:   { finish: [200, 226], dtr: [14, 26], duration: [360, 580] },
  Espresso: { finish: [200, 224], dtr: [17, 23], duration: [380, 680] }
};

// ponytail: O(60) per call, 7 metrics × 60 = 420 iterations. Fine for client-side radar.
export function buildCurveRadarMetrics(
  tempPoints: CurvePoint[],
  fanPoints: CurvePoint[] = [],
  orientation: ProfileOrientation = "Filter"
): CurveRadarMetric[] {
  const temps = normalize(tempPoints);
  const fans = normalize(fanPoints);
  const duration = temps.at(-1)?.timeSeconds ?? 0;
  const startTemp = temps[0]?.value ?? 20;
  const endTemp = temps.at(-1)?.value ?? startTemp;

  const fcTime = crossingTime(temps, 204);
  const dtr = fcTime ? ((duration - fcTime) / duration) * 100 : 20;
  const developmentRise = endTemp - interpolateCurve(temps, duration * 0.67);

  // ROR stability over 30s rolling windows
  const rors: number[] = [];
  for (let t = 30; t < duration; t += 30) {
    const ror = estimateRor(temps, t);
    if (Number.isFinite(ror)) rors.push(ror);
  }
  const avgRor = rors.length ? rors.reduce((s, r) => s + r, 0) / rors.length : 5;
  const rorVariance = rors.length
    ? rors.reduce((s, r) => s + Math.abs(r - avgRor), 0) / rors.length : 0;

  const avgFan = fans.length ? fans.reduce((s, p) => s + p.value, 0) / fans.length : 12000;
  const scales = ORIENTATION_SCALES[orientation];

  return [
    metric("finish", "终点温度", "Finish temp", nscale(endTemp, ...scales.finish), scales.finish),
    metric("stability", "爬升稳定", "Ramp stability", Math.round(100 - nscale(rorVariance, 0.02, 0.38) * 0.9), [70, 100]),
    metric("development", "发展推力", "Development push", nscale(Math.max(developmentRise, 6), 6, 36), [40, 85]),
    metric("dtr", "发展比", "DTR", nscale(dtr, ...scales.dtr), [40, 75]),
    metric("fan", "风速强度", "Fan intensity", nscale(avgFan, 9500, 17000), [35, 70]),
    metric("duration", "时长结构", "Duration", nscale(duration, ...scales.duration), [35, 75]),
    metric("density", "点位密度", "Point density", nscale(temps.length + fans.length * 0.5, 3, 30), [25, 60])
  ];
}

function metric(k: CurveRadarMetric["key"], lzh: string, len: string, v: number, rz: [number, number]): CurveRadarMetric {
  return { key: k, labelZh: lzh, labelEn: len, value: clamp(Math.round(v)), referenceZone: rz };
}

function normalize(points: CurvePoint[]) {
  return points
    .filter((p) => Number.isFinite(p.timeSeconds) && Number.isFinite(p.value))
    .sort((a, b) => a.timeSeconds - b.timeSeconds);
}

function nscale(v: number, min: number, max: number) { return clamp(((v - min) / Math.max(max - min, 1)) * 100); }
function clamp(v: number) { return Math.max(0, Math.min(100, v)); }
