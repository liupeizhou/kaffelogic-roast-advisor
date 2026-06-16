import type { CurvePoint } from "@/lib/types";

export type CurveScoreResult = {
  score: number;
  rating: "excellent" | "good" | "review" | "poor";
  metrics: {
    pointsCompared: number;
    avgAbsDeltaC: number;
    maxAbsDeltaC: number;
    endDeltaC: number;
    durationDeltaSeconds: number;
  };
  notes: string[];
};

export function scoreCurveAgainstReference(uploaded: CurvePoint[], reference: CurvePoint[]): CurveScoreResult {
  const source = normalizePoints(uploaded);
  const target = normalizePoints(reference);
  if (source.length < 2 || target.length < 2) {
    throw new Error("评分需要上传曲线和参考曲线都至少包含 2 个温度点。");
  }

  const maxTime = Math.max(source.at(-1)?.timeSeconds ?? 1, target.at(-1)?.timeSeconds ?? 1, 1);
  const sampleCount = 48;
  const deltas = Array.from({ length: sampleCount }, (_, index) => {
    const timeSeconds = (index / (sampleCount - 1)) * maxTime;
    return Math.abs(interpolate(source, timeSeconds) - interpolate(target, timeSeconds));
  });

  const avgAbsDeltaC = average(deltas);
  const maxAbsDeltaC = Math.max(...deltas);
  const endDeltaC = Math.abs((source.at(-1)?.value ?? 0) - (target.at(-1)?.value ?? 0));
  const durationDeltaSeconds = Math.abs((source.at(-1)?.timeSeconds ?? 0) - (target.at(-1)?.timeSeconds ?? 0));
  const penalty = avgAbsDeltaC * 2.2 + maxAbsDeltaC * 0.55 + endDeltaC * 0.8 + Math.min(durationDeltaSeconds / 18, 14);
  const score = Math.max(0, Math.min(100, Math.round((100 - penalty) * 10) / 10));
  const rating = score >= 85 ? "excellent" : score >= 72 ? "good" : score >= 55 ? "review" : "poor";

  const notes = [
    `平均温差 ${avgAbsDeltaC.toFixed(1)} C，最大温差 ${maxAbsDeltaC.toFixed(1)} C。`,
    `结束温度差 ${endDeltaC.toFixed(1)} C，时长差 ${Math.round(durationDeltaSeconds)} 秒。`,
    rating === "excellent"
      ? "整体跟随度很高，可优先把注意力放在一爆后发展和杯测反馈。"
      : rating === "good"
        ? "整体接近参考曲线，但仍建议检查中后段热量和结束点。"
        : rating === "review"
          ? "曲线与参考有明显偏差，建议结合 FC、ROR 和杯测判断是否调 level 或换 profile。"
          : "曲线偏差较大，不建议直接作为成功案例，需要复盘设备跟线、入豆量和人工操作。"
  ];

  return {
    score,
    rating,
    metrics: {
      pointsCompared: sampleCount,
      avgAbsDeltaC: round1(avgAbsDeltaC),
      maxAbsDeltaC: round1(maxAbsDeltaC),
      endDeltaC: round1(endDeltaC),
      durationDeltaSeconds: Math.round(durationDeltaSeconds)
    },
    notes
  };
}

function normalizePoints(points: CurvePoint[]) {
  return points
    .map((point) => ({ timeSeconds: Number(point.timeSeconds), value: Number(point.value) }))
    .filter((point) => Number.isFinite(point.timeSeconds) && Number.isFinite(point.value))
    .sort((a, b) => a.timeSeconds - b.timeSeconds);
}

function interpolate(points: CurvePoint[], timeSeconds: number) {
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
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}
