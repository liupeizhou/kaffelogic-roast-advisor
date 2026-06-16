import type { CurvePoint } from "@/lib/types";

export type CurveRadarMetric = {
  key: "finish" | "stability" | "development" | "fan" | "duration" | "density";
  labelZh: string;
  labelEn: string;
  value: number;
};

export function buildCurveRadarMetrics(tempPoints: CurvePoint[], fanPoints: CurvePoint[] = []): CurveRadarMetric[] {
  const temps = normalizePoints(tempPoints);
  const fans = normalizePoints(fanPoints);
  const duration = temps.at(-1)?.timeSeconds ?? 0;
  const startTemp = temps[0]?.value ?? 20;
  const endTemp = temps.at(-1)?.value ?? startTemp;
  const lastThirdStart = duration * 0.67;
  const developmentRise = endTemp - interpolate(temps, lastThirdStart);
  const slopes = temps.slice(1).map((point, index) => {
    const previous = temps[index];
    return (point.value - previous.value) / Math.max(point.timeSeconds - previous.timeSeconds, 1);
  });
  const avgSlope = average(slopes);
  const slopeVariance = average(slopes.map((slope) => Math.abs(slope - avgSlope)));
  const avgFan = average(fans.map((point) => point.value));

  return [
    metric("finish", "终点温度", "Finish temp", scale(endTemp, 188, 226)),
    metric("stability", "爬升稳定", "Ramp stability", 100 - scale(slopeVariance, 0.02, 0.32)),
    metric("development", "发展推力", "Development push", scale(developmentRise, 8, 34)),
    metric("fan", "风速强度", "Fan intensity", scale(avgFan || 12000, 9000, 17000)),
    metric("duration", "时长结构", "Duration", scale(duration, 360, 840)),
    metric("density", "点位密度", "Point density", scale(temps.length + fans.length * 0.5, 4, 18))
  ];
}

function metric(key: CurveRadarMetric["key"], labelZh: string, labelEn: string, value: number): CurveRadarMetric {
  return { key, labelZh, labelEn, value: clamp(Math.round(value)) };
}

function normalizePoints(points: CurvePoint[]) {
  return points
    .map((point) => ({ timeSeconds: Number(point.timeSeconds), value: Number(point.value) }))
    .filter((point) => Number.isFinite(point.timeSeconds) && Number.isFinite(point.value))
    .sort((a, b) => a.timeSeconds - b.timeSeconds);
}

function interpolate(points: CurvePoint[], timeSeconds: number) {
  if (!points.length) return 0;
  if (timeSeconds <= points[0].timeSeconds) return points[0].value;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const next = points[index];
    if (timeSeconds <= next.timeSeconds) {
      const ratio = (timeSeconds - previous.timeSeconds) / Math.max(next.timeSeconds - previous.timeSeconds, 1);
      return previous.value + (next.value - previous.value) * ratio;
    }
  }
  return points.at(-1)?.value ?? 0;
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function scale(value: number, min: number, max: number) {
  return ((value - min) / Math.max(max - min, 1)) * 100;
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}
