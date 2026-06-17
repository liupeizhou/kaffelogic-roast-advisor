import type { CurvePoint, ProfileOrientation } from "@/lib/types";
import { crossingTime, interpolateCurve, estimateRor, round1 } from "@/lib/curve-bezier";
import { findClosestReference, type CurveReferenceRecord, predictLandmarks } from "@/lib/reference-curves";

export type CurveScoreResult = {
  score: number;
  rating: "excellent" | "good" | "review" | "poor";
  orientation?: ProfileOrientation | null;
  phaseBreakdown: {
    dryingPct: number;
    maillardPct: number;
    developmentPct: number;
    dtr: number;
  };
  metrics: {
    pointsCompared: number;
    avgAbsDeltaC: number;
    maxAbsDeltaC: number;
    endDeltaC: number;
    durationDeltaSeconds: number;
    rorStabilityScore: number;
    phaseAlignmentScore: number;
  };
  notes: string[];
  referenceRecord?: CurveReferenceRecord | null;
};

const PHASE_IDEALS: Record<ProfileOrientation, { drying: [number, number]; maillard: [number, number]; dtr: [number, number] }> = {
  Filter: {
    drying: [41, 50],
    maillard: [28, 42],
    dtr: [15, 25]
  },
  Espresso: {
    drying: [37, 45],
    maillard: [25, 40],
    dtr: [17, 22]
  }
};

export function scoreCurveAgainstReference(
  uploaded: CurvePoint[],
  reference: CurvePoint[],
  orientation?: ProfileOrientation | null
): CurveScoreResult {
  const source = normalizeCurvePoints(uploaded);
  const target = normalizeCurvePoints(reference);
  if (source.length < 2 || target.length < 2) {
    throw new Error("评分需要上传曲线和参考曲线都至少包含 2 个温度点。");
  }

  // Phase computation
  const sourceEnd = source.at(-1)!;
  const targetEnd = target.at(-1)!;
  const maxTime = Math.max(sourceEnd.timeSeconds, targetEnd.timeSeconds, 1);

  // find CC/FC crossing times on both curves (use 170°C / 204°C as defaults)
  const ccTemp = 170;
  const fcTemp = 204;
  const srcCc = crossingTime(source, ccTemp) ?? Math.round(maxTime * 0.42);
  const srcFc = crossingTime(source, fcTemp) ?? Math.round(maxTime * 0.78);
  const tgtCc = crossingTime(target, ccTemp) ?? Math.round(maxTime * 0.42);
  const tgtFc = crossingTime(target, fcTemp) ?? Math.round(maxTime * 0.78);

  const srcDrying = srcCc / sourceEnd.timeSeconds * 100;
  const srcMaillard = Math.max(0, srcFc - srcCc) / sourceEnd.timeSeconds * 100;
  const srcDtr = Math.max(0, sourceEnd.timeSeconds - srcFc) / sourceEnd.timeSeconds * 100;
  const tgtDrying = tgtCc / targetEnd.timeSeconds * 100;
  const tgtMaillard = Math.max(0, tgtFc - tgtCc) / targetEnd.timeSeconds * 100;
  const tgtDtr = Math.max(0, targetEnd.timeSeconds - tgtFc) / targetEnd.timeSeconds * 100;

  // Uniform sampling for temperature delta
  const sampleCount = 48;
  const deltas = Array.from({ length: sampleCount }, (_, i) => {
    const t = (i / (sampleCount - 1)) * maxTime;
    return Math.abs(interpolateCurve(source, t) - interpolateCurve(target, t));
  });

  const avgAbsDeltaC = average(deltas);
  const maxAbsDeltaC = Math.max(...deltas);
  const endDeltaC = Math.abs(sourceEnd.value - targetEnd.value);
  const durationDeltaSeconds = Math.abs(sourceEnd.timeSeconds - targetEnd.timeSeconds);
  const tempPenalty = avgAbsDeltaC * 2.2 + maxAbsDeltaC * 0.55 + endDeltaC * 0.8 + Math.min(durationDeltaSeconds / 18, 14);

  // ROR stability score
  const rorStabilityScore = computeRorStabilityScore(source);

  // Phase alignment score
  const phaseAlignmentScore = computePhaseAlignmentScore(
    { drying: srcDrying, maillard: srcMaillard, dtr: srcDtr },
    { drying: tgtDrying, maillard: tgtMaillard, dtr: tgtDtr },
    orientation
  );

  const score = Math.max(0, Math.min(100, Math.round(
    100 - tempPenalty * 0.6 + rorStabilityScore * 0.2 + phaseAlignmentScore * 0.2
  )));

  const rating = score >= 85 ? "excellent" : score >= 72 ? "good" : score >= 55 ? "review" : "poor";

  const notes = buildNotes(rating, avgAbsDeltaC, maxAbsDeltaC, srcDtr, tgtDtr, rorStabilityScore, orientation);

  return {
    score,
    rating,
    orientation,
    phaseBreakdown: {
      dryingPct: round1(srcDrying),
      maillardPct: round1(srcMaillard),
      developmentPct: round1(srcDtr),
      dtr: round1(srcDtr)
    },
    metrics: {
      pointsCompared: sampleCount,
      avgAbsDeltaC: round1(avgAbsDeltaC),
      maxAbsDeltaC: round1(maxAbsDeltaC),
      endDeltaC: round1(endDeltaC),
      durationDeltaSeconds: Math.round(durationDeltaSeconds),
      rorStabilityScore: round1(rorStabilityScore),
      phaseAlignmentScore: round1(phaseAlignmentScore)
    },
    notes,
    referenceRecord: null
  };
}

/**
 * Score a curve against the sparse reference table as baseline.
 */
export function scoreCurveAgainstReferenceTable(
  uploaded: CurvePoint[],
  referenceRecords: CurveReferenceRecord[],
  orientation: ProfileOrientation = "Filter"
): CurveScoreResult {
  const source = normalizeCurvePoints(uploaded);
  if (source.length < 2) {
    throw new Error("评分需要上传曲线至少包含 2 个温度点。");
  }

  const sourceEnd = source.at(-1)!;
  const duration = sourceEnd.timeSeconds;

  const referenceRecord = findClosestReference(
    duration,
    sourceEnd.value,
    orientation,
    referenceRecords
  );

  if (!referenceRecord) {
    // Fallback: self-score with default orientation
    return scoreCurveAgainstReference(source, source, orientation);
  }

  const landmarks = predictLandmarks(referenceRecord);

  // Phase analysis on source curve
  const ccTemp = landmarks.ccTemp;
  const fcTemp = landmarks.fcTemp;
  const srcCc = crossingTime(source, ccTemp) ?? Math.round(duration * referenceRecord.ccQ);
  const srcFc = crossingTime(source, fcTemp) ?? Math.round(duration * referenceRecord.fcQ);

  const srcDrying = srcCc / duration * 100;
  const srcMaillard = Math.max(0, srcFc - srcCc) / duration * 100;
  const srcDtr = Math.max(0, duration - srcFc) / duration * 100;

  // Ideal phase ratios from reference
  const idealDrying = referenceRecord.ccQ * 100;
  const idealMaillard = (referenceRecord.fcQ - referenceRecord.ccQ) * 100;
  const idealDtr = (1 - referenceRecord.fcQ) * 100;

  // Check key metrics against reference
  const endDelta = Math.abs(sourceEnd.value - referenceRecord.refDropTemp);
  const durationDelta = Math.abs(duration - referenceRecord.refDropTime);
  const dryingDelta = Math.abs(srcDrying - idealDrying);
  const dtrDelta = Math.abs(srcDtr - idealDtr);
  const maillardDelta = Math.abs(srcMaillard - idealMaillard);

  // ROR stability
  const rorStabilityScore = computeRorStabilityScore(source);

  // Phase alignment against ideal
  const phaseAlignmentScore = computePhaseAlignmentScore(
    { drying: srcDrying, maillard: srcMaillard, dtr: srcDtr },
    { drying: idealDrying, maillard: idealMaillard, dtr: idealDtr },
    orientation
  );

  // Penalty from deviations
  const penalty = endDelta * 1.5 + durationDelta / 30 + dryingDelta * 0.8 + maillardDelta * 0.6 + dtrDelta * 1.2;
  const score = Math.max(0, Math.min(100, Math.round(
    100 - penalty + rorStabilityScore * 0.15 + phaseAlignmentScore * 0.15
  )));

  const rating = score >= 85 ? "excellent" : score >= 72 ? "good" : score >= 55 ? "review" : "poor";

  const referenceNotes = [
    `参考终点 ${referenceRecord.refDropTemp.toFixed(1)}°C/${secondsToMMSS(referenceRecord.refDropTime)}，同比偏差 ${endDelta.toFixed(1)}°C`,
    `理想 DTR ${idealDtr.toFixed(1)}% vs 实际 ${srcDtr.toFixed(1)}%`,
    `ROR 起始 ${referenceRecord.startRor.toFixed(0)}→FC ${referenceRecord.fcRor.toFixed(0)}→Drop ${referenceRecord.dropRor.toFixed(1)} °C/min`,
  ];

  const ratingNotes = buildNotes(rating, 0, 0, srcDtr, idealDtr, rorStabilityScore, orientation);

  return {
    score,
    rating,
    orientation,
    phaseBreakdown: {
      dryingPct: round1(srcDrying),
      maillardPct: round1(srcMaillard),
      developmentPct: round1(srcDtr),
      dtr: round1(srcDtr)
    },
    metrics: {
      pointsCompared: 48,
      avgAbsDeltaC: round1(endDelta),
      maxAbsDeltaC: round1(Math.max(endDelta, dryingDelta, dtrDelta)),
      endDeltaC: round1(endDelta),
      durationDeltaSeconds: Math.round(durationDelta),
      rorStabilityScore: round1(rorStabilityScore),
      phaseAlignmentScore: round1(phaseAlignmentScore)
    },
    notes: [...referenceNotes, ...ratingNotes],
    referenceRecord
  };
}

function computeRorStabilityScore(points: CurvePoint[]): number {
  const rorValues: number[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const ror = estimateRor(points, points[i].timeSeconds);
    if (Number.isFinite(ror)) rorValues.push(ror);
  }
  if (rorValues.length < 3) return 50;
  const mean = average(rorValues);
  const variance = average(rorValues.map(v => (v - mean) ** 2));
  return Math.max(0, Math.min(100, 100 - Math.sqrt(variance) * 4));
}

function computePhaseAlignmentScore(
  source: { drying: number; maillard: number; dtr: number },
  target: { drying: number; maillard: number; dtr: number },
  orientation?: ProfileOrientation | null
): number {
  const ideal = orientation ? PHASE_IDEALS[orientation] : PHASE_IDEALS.Filter;
  const dtrInRange = source.dtr >= ideal.dtr[0] && source.dtr <= ideal.dtr[1];
  const dryingInRange = source.drying >= ideal.drying[0] && source.drying <= ideal.drying[1];
  const maillardInRange = source.maillard >= ideal.maillard[0] && source.maillard <= ideal.maillard[1];

  let score = (dtrInRange ? 35 : 10) + (dryingInRange ? 35 : 10) + (maillardInRange ? 30 : 10);

  // bonus for matching target phase distribution
  const phaseDelta = Math.abs(source.drying - target.drying) + Math.abs(source.maillard - target.maillard) + Math.abs(source.dtr - target.dtr);
  score -= phaseDelta * 0.8;

  return Math.max(0, Math.min(100, score));
}

function buildNotes(
  rating: CurveScoreResult["rating"],
  avgDelta: number,
  maxDelta: number,
  srcDtr: number,
  tgtDtr: number,
  rorStability: number,
  orientation?: ProfileOrientation | null
): string[] {
  const notes = [
    `平均温差 ${avgDelta.toFixed(1)} C，最大温差 ${maxDelta.toFixed(1)} C。`,
    `DTR ${srcDtr.toFixed(1)}% vs 参考 ${tgtDtr.toFixed(1)}%，ROR稳定度 ${rorStability.toFixed(0)}。`
  ];
  if (orientation) {
    const ideal = PHASE_IDEALS[orientation];
    if (srcDtr < ideal.dtr[0]) notes.push(`${orientation} 模式 DTR 偏低，建议延长发展段或提前进入一爆节奏。`);
    else if (srcDtr > ideal.dtr[1]) notes.push(`${orientation} 模式 DTR 偏高，注意避免焦苦或过度发展。`);
  }
  if (rorStability < 65) notes.push("ROR 稳定度偏低，检查跟线、风扇转速或入豆量一致性。");
  if (rating === "excellent") notes.push("曲线结构与参考曲线高度一致，建议下一阶段聚焦杯测风味确认。");
  else if (rating === "good") notes.push("整体接近参考曲线，中后段热量和结束点值得复核。");
  else if (rating === "review") notes.push("与参考有明显偏差，建议结合 FC 时间、ROR 和杯测判断调整方向。");
  else notes.push("偏差较大，不建议作为成功案例直接参考，需要复盘设备跟线和操作流程。");

  return notes;
}

function normalizeCurvePoints(points: CurvePoint[]) {
  return points
    .map((p) => ({ timeSeconds: Number(p.timeSeconds), value: Number(p.value) }))
    .filter((p) => Number.isFinite(p.timeSeconds) && Number.isFinite(p.value))
    .sort((a, b) => a.timeSeconds - b.timeSeconds);
}

function average(values: number[]) {
  return values.reduce((s, v) => s + v, 0) / Math.max(values.length, 1);
}

function secondsToMMSS(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
