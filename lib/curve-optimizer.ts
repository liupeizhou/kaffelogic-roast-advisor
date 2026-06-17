import type { BezierAnchor } from "@/lib/types";
import { bezierPosition, sampleBezierAnchors } from "@/lib/curve-bezier";

type Events = { ccTemp: number; fcTemp: number; dropTemp: number };
type PhaseWindows = { dryingEndSec: number; fcSec: number; dropSec: number };
type SampleData = { times: number[]; temps: number[]; rors: number[] };

// ---- Sampling (dense reference evaluation) ----

function sampleDense(anchors: BezierAnchor[]): SampleData {
  const { tempPoints, rorPoints } = sampleBezierAnchors(anchors, 5); // 5s step ≈ 80-130 points for typical roasts
  return {
    times: tempPoints.map(p => p.timeSeconds),
    temps: tempPoints.map(p => p.value),
    rors: rorPoints.map(p => p.value)
  };
}

// ---- Temperature crossing (binary search on Bezier segments) ----

function crossingT(anchors: BezierAnchor[], target: number): number {
  if (target <= 0) return 0;
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i], b = anchors[i + 1];
    const lo = Math.min(a.position.value, b.position.value);
    const hi = Math.max(a.position.value, b.position.value);
    if (target < lo || target > hi) continue;
    let lo2 = 0, hi2 = 1;
    for (let j = 0; j < 50; j++) {
      const mid = (lo2 + hi2) / 2;
      const v = bezierPosition(a.position.value, a.rightCtrl.value, b.leftCtrl.value, b.position.value, mid);
      if (v < target) {
        lo2 = mid;
      } else {
        hi2 = mid;
      }
    }
    const r = (lo2 + hi2) / 2;
    return a.position.timeSeconds + r * (b.position.timeSeconds - a.position.timeSeconds);
  }
  return anchors.at(-1)!.position.timeSeconds;
}

function phaseWindows(anchors: BezierAnchor[], events: Events): PhaseWindows {
  const dropSec = crossingT(anchors, events.dropTemp);
  const fcSec = events.fcTemp > 0 ? crossingT(anchors, events.fcTemp) : 0;
  const ccSec = events.ccTemp > 0 ? crossingT(anchors, events.ccTemp) : fcSec > 0 ? fcSec * 0.45 : dropSec * 0.35;
  return { dryingEndSec: ccSec, fcSec, dropSec };
}

// ---- Derivative metrics ----

function rorRoughness(s: SampleData) {
  let sum = 0;
  for (let i = 1; i < s.times.length; i++) {
    const dt = s.times[i] - s.times[i - 1];
    if (dt < 1e-10) continue;
    const dr = (s.rors[i] - s.rors[i - 1]) / dt * 60;
    sum += dr * dr;
  }
  return sum;
}

function maxAbsDRoR(s: SampleData) {
  let max = 0;
  for (let i = 5; i < s.times.length; i++) {
    const dt = s.times[i] - s.times[i - 1];
    if (dt < 1e-10) continue;
    const v = Math.abs((s.rors[i] - s.rors[i - 1]) / dt * 60);
    if (v > max) max = v;
  }
  return max;
}

function countFlicks(s: SampleData) {
  let peak = 0;
  for (let i = 1; i < s.rors.length; i++) if (s.rors[i] > s.rors[peak]) peak = i;
  let flicks = 0;
  for (let i = peak + 1; i < s.rors.length; i++) if (s.rors[i] > s.rors[i - 1] + 0.01) flicks++;
  return flicks;
}

function endRorAvg(s: SampleData) {
  const start = Math.floor(s.rors.length * 0.95);
  let sum = 0;
  for (let i = start; i < s.rors.length; i++) sum += s.rors[i];
  return sum / Math.max(s.rors.length - start, 1);
}

// ---- Robust trimmed-mean ----

function trimmedMean(values: number[], trimFrac = 0.2): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length <= 4) return sorted.reduce((s, v) => s + v, 0) / sorted.length;
  const lo = Math.floor(sorted.length * trimFrac);
  const hi = sorted.length - lo;
  if (hi <= lo) return sorted.reduce((s, v) => s + v, 0) / sorted.length;
  let sum = 0;
  for (let i = lo; i < hi; i++) sum += sorted[i];
  return sum / (hi - lo);
}

// ---- Knot-boundary shock with trimmed-mean ----

type ShockEntry = { knotIndex: number; timeSec: number; phase: string; shock: number };

function knotShock(anchors: BezierAnchor[], s: SampleData, windows: PhaseWindows & { fcSec: number; dryingEndSec: number }) {
  let total = 0, max = 0;
  const perKnot: ShockEntry[] = [];
  const wBefore = 12, wAfter = 3;

  for (let i = 1; i < anchors.length - 1; i++) {
    const t = anchors[i].position.timeSeconds;
    const before: number[] = [], after: number[] = [];
    for (let j = 0; j < s.times.length; j++) {
      if (s.times[j] >= t - wBefore && s.times[j] <= t - wAfter) before.push(s.rors[j]);
      if (s.times[j] >= t + wAfter && s.times[j] <= t + wBefore) after.push(s.rors[j]);
    }
    if (before.length < 3 || after.length < 3) continue;
    const avgB = trimmedMean(before), avgA = trimmedMean(after);
    const shock = Math.abs(avgA - avgB);
    const phase = t < windows.dryingEndSec ? "Drying" : t < windows.fcSec ? "Maillard" : "Development";
    const weight = phase === "Drying" ? 0.5 : phase === "Maillard" ? 1 : 1.5;
    total += weight * shock * shock;
    if (shock > max) max = shock;
    perKnot.push({ knotIndex: i, timeSec: t, phase, shock });
  }
  return { total, max, perKnot };
}

// ---- Cost function (12 terms, calibrated to the internal reference optimizer) ----

function costFn(
  anchors: BezierAnchor[], events: Events, windows: PhaseWindows,
  sampled: SampleData, originalSampled?: SampleData
): number {
  const { times, rors, temps } = sampled;
  let cost = 0;

  // 1. RoR roughness
  cost += rorRoughness(sampled);
  // 2. Peak |dRoR/dt|
  const maxD = maxAbsDRoR(sampled);
  cost += 10 * maxD * maxD;
  // 3. Flick penalty
  cost += 1e8 * countFlicks(sampled);
  // 4. Negative RoR
  for (let i = 1; i < rors.length; i++) if (rors[i] < 0) cost += 1e6 * rors[i] * rors[i];
  // 5-7. Time drift
  if (events.ccTemp > 0) { const d = crossingT(anchors, events.ccTemp) - windows.dryingEndSec; cost += 1e4 * d * d; }
  if (events.fcTemp > 0) { const d = crossingT(anchors, events.fcTemp) - windows.fcSec; cost += 1e4 * d * d; }
  { const d = crossingT(anchors, events.dropTemp) - windows.dropSec; cost += 1e4 * d * d; }
  // 8-10. Temperature fidelity
  if (originalSampled) {
    let tempSq = 0, phaseSq = 0, devRorSq = 0, devCount = 0;
    const n = Math.min(times.length, originalSampled.times.length);
    for (let i = 0; i < n; i++) {
      const dt = temps[i] - originalSampled.temps[i];
      tempSq += dt * dt;
      const w = times[i] < windows.dryingEndSec ? 1 : times[i] < windows.fcSec ? 2 : 4;
      phaseSq += w * dt * dt;
      if (times[i] >= windows.fcSec) { devRorSq += (sampled.rors[i] - originalSampled.rors[i]) ** 2; devCount++; }
    }
    cost += 50 * tempSq / n + 30 * phaseSq / n + (devCount > 0 ? 200 * devRorSq / devCount : 0);
  }
  // 11. Maillard plateau
  let plateauRun = 0, plateauCost = 0;
  for (let i = 1; i < times.length; i++) {
    if (times[i] <= windows.dryingEndSec || times[i] >= windows.fcSec) { plateauRun = 0; continue; }
    const dt = times[i] - times[i - 1];
    if (dt < 1e-10) continue;
    if (Math.abs((rors[i] - rors[i - 1]) / dt) < 0.002) {
      plateauRun++;
      if (plateauRun > 10) plateauCost += (plateauRun - 10) ** 2;
    } else plateauRun = 0;
  }
  cost += 100 * plateauCost;
  // 12. Knot shock
  const shock = knotShock(anchors, sampled, windows);
  cost += 5 * shock.total;

  return cost;
}

// ---- Acceptance gate (10 constraints) ----

export type AcceptanceReport = {
  accepted: boolean;
  ccDrift: number; fcDrift: number; dropDrift: number;
  flicksBefore: number; flicksAfter: number;
  endRorBefore: number; endRorAfter: number;
  maxDRoRBefore: number; maxDRoRAfter: number;
  maxTempDelta: number; rmsTempDelta: number;
  devMaxTempDelta: number; devRorStability: number;
  plateauDetected: boolean;
  maxBoundaryShockBefore: number; maxBoundaryShockAfter: number;
  roughnessBefore: number; roughnessAfter: number;
  roughnessImprovement: number;
  maxDRoRImprovement: number;
  boundaryShockImprovement: number;
  reasons: string[];
};

function acceptance(original: BezierAnchor[], optimized: BezierAnchor[], events: Events): AcceptanceReport {
  const o = sampleDense(original), p = sampleDense(optimized);
  const wo = phaseWindows(original, events), wp = phaseWindows(optimized, events);
  const ccDrift = events.ccTemp > 0 ? crossingT(optimized, events.ccTemp) - crossingT(original, events.ccTemp) : 0;
  const fcDrift = events.fcTemp > 0 ? crossingT(optimized, events.fcTemp) - crossingT(original, events.fcTemp) : 0;
  const dropDrift = crossingT(optimized, events.dropTemp) - crossingT(original, events.dropTemp);
  const fBefore = countFlicks(o), fAfter = countFlicks(p);
  const erBefore = endRorAvg(o), erAfter = endRorAvg(p);
  const mdBefore = maxAbsDRoR(o), mdAfter = maxAbsDRoR(p);
  const rBefore = rorRoughness(o), rAfter = rorRoughness(p);

  let maxD = 0, sumD = 0, devMax = 0, devRorSq = 0, devCount = 0;
  const n = Math.min(o.times.length, p.times.length);
  for (let i = 0; i < n; i++) {
    const d = Math.abs(p.temps[i] - o.temps[i]);
    if (d > maxD) maxD = d;
    sumD += d * d;
    if (o.times[i] >= wo.fcSec) { if (d > devMax) devMax = d; devRorSq += (p.rors[i] - o.rors[i]) ** 2; devCount++; }
  }
  const rms = Math.sqrt(sumD / n);
  const devRor = devCount > 0 ? Math.sqrt(devRorSq / devCount) : 0;

  let run = 0, plateau = false;
  for (let i = 1; i < n; i++) {
    const dt = o.times[i] - o.times[i - 1];
    if (dt < 1e-10) continue;
    if (o.times[i] > wo.dryingEndSec && o.times[i] < wo.fcSec && Math.abs((p.rors[i] - p.rors[i - 1]) / dt) < 0.002) {
      run++;
      if (run > 10) { plateau = true; break; }
    } else run = 0;
  }

  const so = knotShock(original, o, wo);
  const sp = knotShock(optimized, p, wp);

  const reasons: string[] = [];
  if (Math.abs(ccDrift) > 0.01) reasons.push(`CC drift ${ccDrift.toFixed(2)}s`);
  if (Math.abs(fcDrift) > 0.01) reasons.push(`FC drift ${fcDrift.toFixed(2)}s`);
  if (Math.abs(dropDrift) > 0.01) reasons.push(`Drop drift ${dropDrift.toFixed(2)}s`);
  if (fAfter > 0) reasons.push(`${fAfter} flick(s)`);
  if (erAfter < erBefore * 0.8) reasons.push(`End RoR degraded`);
  if (mdAfter > mdBefore * 1.15) reasons.push(`|dRoR/dt| worsened`);
  if (maxD > 8) reasons.push(`Max temp delta ${maxD.toFixed(1)}°C`);
  if (rms > 3) reasons.push(`RMS ${rms.toFixed(1)}°C`);
  if (devMax > 3) reasons.push(`Dev delta ${devMax.toFixed(1)}°C`);
  if (plateau) reasons.push(`Maillard plateau`);
  if (devRor > 2) reasons.push(`Dev RoR unstable`);

  return {
    accepted: reasons.length === 0,
    ccDrift, fcDrift, dropDrift,
    flicksBefore: fBefore, flicksAfter: fAfter,
    endRorBefore: erBefore, endRorAfter: erAfter,
    maxDRoRBefore: mdBefore, maxDRoRAfter: mdAfter,
    maxTempDelta: maxD, rmsTempDelta: rms,
    devMaxTempDelta: devMax, devRorStability: devRor,
    plateauDetected: plateau,
    maxBoundaryShockBefore: so.max, maxBoundaryShockAfter: sp.max,
    roughnessBefore: rBefore, roughnessAfter: rAfter,
    roughnessImprovement: rBefore > 0 ? 1 - rAfter / rBefore : 0,
    maxDRoRImprovement: mdBefore > 0 ? 1 - mdAfter / mdBefore : 0,
    boundaryShockImprovement: so.max > 0 ? 1 - sp.max / so.max : 0,
    reasons
  };
}

// ---- Optimization engine ----

const PHI = (Math.sqrt(5) - 1) / 2;
interface BoundBox { lo: number[]; hi: number[] }

function anchorAngleParams(anchors: BezierAnchor[]): { angles: number[]; lengths: number[] } {
  const n = anchors.length;
  const angles: number[] = [], lengths: number[] = [];
  { const dx = anchors[0].rightCtrl.timeSeconds - anchors[0].position.timeSeconds; const dy = anchors[0].rightCtrl.value - anchors[0].position.value; angles.push(Math.atan2(dy, dx)); lengths.push(Math.max(Math.sqrt(dx * dx + dy * dy), 1)); }
  for (let i = 1; i < n - 1; i++) {
    { const dx = anchors[i].position.timeSeconds - anchors[i].leftCtrl.timeSeconds; const dy = anchors[i].position.value - anchors[i].leftCtrl.value; let a = Math.atan2(dy, dx); const l = Math.sqrt(dx * dx + dy * dy); if (l > 1e-10) { const pd = anchors[i - 1].rightCtrl.timeSeconds - anchors[i - 1].position.timeSeconds; const pt = anchors[i - 1].rightCtrl.value - anchors[i - 1].position.value; a = (a + Math.atan2(pt, pd)) / 2; } angles.push(Math.max(0, Math.min(Math.PI / 2, a))); lengths.push(Math.max(l, 1)); }
    { const dx = anchors[i].rightCtrl.timeSeconds - anchors[i].position.timeSeconds; const dy = anchors[i].rightCtrl.value - anchors[i].position.value; angles.push(Math.max(0, Math.min(Math.PI / 2, Math.atan2(dy, dx)))); lengths.push(Math.max(Math.sqrt(dx * dx + dy * dy), 1)); }
  }
  { const dx = anchors[n - 1].position.timeSeconds - anchors[n - 1].leftCtrl.timeSeconds; const dy = anchors[n - 1].position.value - anchors[n - 1].leftCtrl.value; angles.push(Math.atan2(dy, dx)); lengths.push(Math.max(Math.sqrt(dx * dx + dy * dy), 1)); }
  return { angles, lengths };
}

function applyAngleParams(base: BezierAnchor[], params: number[]): BezierAnchor[] {
  const n = base.length, cloned = deepClone(base);
  const split = params.length / 2, angles = params.slice(0, split), lengths = params.slice(split);
  let idx = 0;
  { const a = angles[idx], l = lengths[idx++]; cloned[0].rightCtrl.timeSeconds = Math.min(cloned[0].position.timeSeconds + l * Math.cos(a), cloned[1].position.timeSeconds * 0.9); cloned[0].rightCtrl.value = cloned[0].position.value + l * Math.sin(a); }
  for (let i = 1; i < n - 1; i++) {
    { const a = angles[idx], l = lengths[idx++]; cloned[i].leftCtrl.timeSeconds = Math.max(cloned[i].position.timeSeconds - l * Math.cos(a), cloned[i - 1].position.timeSeconds + 1); cloned[i].leftCtrl.value = cloned[i].position.value - l * Math.sin(a); }
    { const a = angles[idx], l = lengths[idx++]; cloned[i].rightCtrl.timeSeconds = Math.min(cloned[i].position.timeSeconds + l * Math.cos(a), cloned[i + 1].position.timeSeconds * 0.9); cloned[i].rightCtrl.value = cloned[i].position.value + l * Math.sin(a); }
  }
  { const a = angles[idx], l = lengths[idx++]; cloned[n - 1].leftCtrl.timeSeconds = Math.max(cloned[n - 1].position.timeSeconds - l * Math.cos(a), cloned[n - 2].position.timeSeconds + 1); cloned[n - 1].leftCtrl.value = cloned[n - 1].position.value - l * Math.sin(a); }
  return cloned;
}

function goldenMin(fn: (x: number) => number, lo: number, hi: number, maxIter = 50): number {
  let a = lo, b = hi, c = b - PHI * (b - a), d = a + PHI * (b - a), fc = fn(c), fd = fn(d);
  for (let i = 0; i < maxIter && b - a > 1e-10; i++) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - PHI * (b - a); fc = fn(c); }
    else { a = c; c = d; fc = fd; d = a + PHI * (b - a); fd = fn(d); }
  }
  return fc < fd ? c : d;
}

function coordinateDescent(fn: (params: number[]) => number, init: number[], bounds: BoundBox, maxIter = 20): number[] {
  const params = [...init];
  for (let iter = 0; iter < maxIter; iter++) {
    const prevCost = fn(params);
    for (let i = 0; i < params.length; i++) {
      const p = (val: number) => { const c = [...params]; c[i] = val; return fn(c); };
      params[i] = goldenMin(p, bounds.lo[i], bounds.hi[i]);
    }
    if (prevCost - fn(params) < prevCost * 1e-4) break;
  }
  return params;
}

function nelderMead(fn: (params: number[]) => number, init: number[], maxIter = 300): number[] {
  if (init.length > 6) return init; // too many dims
  const n = init.length;
  const simplex: number[][] = [[...init]];
  for (let i = 0; i < n; i++) { const p = [...init]; p[i] += Math.abs(init[i]) > 0.01 ? init[i] * 0.02 : 0.02; simplex.push(p); }
  for (let iter = 0; iter < maxIter; iter++) {
    simplex.sort((a, b) => fn(a) - fn(b));
    if (fn(simplex[n]) - fn(simplex[0]) < 1e-14) break;
    const centroid = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) centroid[j] += simplex[i][j];
    for (let j = 0; j < n; j++) centroid[j] /= n;
    const reflected = centroid.map((c, j) => c + 1 * (c - simplex[n][j]));
    const fr = fn(reflected);
    if (fr < fn(simplex[0])) { const exp = centroid.map((c, j) => c + 2 * (reflected[j] - c)); simplex[n] = fn(exp) < fr ? exp : reflected; }
    else if (fr < fn(simplex[n - 1])) { simplex[n] = reflected; }
    else {
      const con = centroid.map((c, j) => c + 0.5 * (simplex[n][j] - c));
      if (fn(con) < fn(simplex[n])) { simplex[n] = con; }
      else { for (let i = 1; i <= n; i++) simplex[i] = simplex[i].map((v, j) => simplex[0][j] + 0.5 * (v - simplex[0][j])); }
    }
  }
  simplex.sort((a, b) => fn(a) - fn(b));
  return simplex[0];
}

// ---- Public API ----

export type OptimizationResult = {
  optimized: BezierAnchor[] | null;
  acceptance: AcceptanceReport | null;
};

/**
 * RoR optimizer for Kaffelogic Bezier anchor profiles.
 * Pipeline: NM(20) → NM(3000) → CD(20) → NM(5) — matching original worker.
 * Uses 5s dense sampling for cost eval, 15s for phase windowing.
 */
export function optimizeProfileCurve(anchors: BezierAnchor[], events: Events): OptimizationResult {
  if (anchors.length < 3) return { optimized: null, acceptance: null };

  const cloned = deepClone(anchors);
  const baseSampled = sampleDense(cloned);
  const paramData = anchorAngleParams(cloned);
  const init = [...paramData.angles, ...paramData.lengths];

  const bounds = (() => {
    const { angles, lengths } = paramData;
    const lo: number[] = [], hi: number[] = [];
    for (let i = 0; i < angles.length; i++) { lo.push(0); hi.push(Math.PI / 2); }
    for (let i = 0; i < lengths.length; i++) { lo.push(1); hi.push(Math.max(lengths[i] * 3, 30)); }
    return { lo, hi };
  })();

  const evalfn = (x: number[]) => {
    const candidate = applyAngleParams(cloned, x);
    const s = sampleDense(candidate);
    return costFn(candidate, events, phaseWindows(candidate, events), s, baseSampled);
  };

  // NM(20)
  let params = nelderMead(evalfn, init, 20);
  // NM(3000) — note: on 5-anchor curve (12 params), Nelder-Mead degrades to coordinate descent
  const isLowDim = init.length <= 6;
  params = isLowDim ? nelderMead(evalfn, params, 3000) : coordinateDescent(evalfn, params, bounds, 40);
  // CD(20)
  params = coordinateDescent(evalfn, params, bounds, 20);
  // NM(5) final polish
  params = isLowDim ? nelderMead(evalfn, params, 5) : params;

  const optimized = applyAngleParams(cloned, params);
  optimized[0].leftCtrl = { timeSeconds: 0, value: 0 };
  optimized[optimized.length - 1].rightCtrl = { timeSeconds: 0, value: 0 };

  const acc = acceptance(anchors, optimized, events);
  return { optimized: acc.accepted ? optimized : null, acceptance: acc };
}

/**
 * Move selected knot positions within ±15s/±5°C, re-optimize all handles.
 */
export function optimizeWithFreeKnots(
  anchors: BezierAnchor[], events: Events, knotIndices: number[], maxIter = 300
): OptimizationResult {
  if (anchors.length < 3 || knotIndices.length === 0) return { optimized: null, acceptance: null };

  const cloned = deepClone(anchors);
  const knotBounds: Array<{ lo: { t: number; T: number }; hi: { t: number; T: number } }> = [];
  const initKnots: number[] = [];
  for (const idx of knotIndices) {
    if (idx <= 0 || idx >= anchors.length - 1) continue;
    const a = anchors[idx];
    const prevT = anchors[idx - 1].position.timeSeconds;
    const nextT = anchors[idx + 1].position.timeSeconds;
    knotBounds.push({
      lo: { t: Math.max(prevT + 1, a.position.timeSeconds - 15), T: a.position.value - 5 },
      hi: { t: Math.min(nextT - 1, a.position.timeSeconds + 15), T: a.position.value + 5 }
    });
    initKnots.push(a.position.timeSeconds, a.position.value);
  }
  if (knotBounds.length === 0) return { optimized: null, acceptance: null };

  const angleData = anchorAngleParams(cloned);
  const init = [...initKnots, ...angleData.angles, ...angleData.lengths];
  const lo: number[] = [], hi: number[] = [];
  for (const kb of knotBounds) { lo.push(kb.lo.t, kb.lo.T); hi.push(kb.hi.t, kb.hi.T); }
  for (let i = 0; i < angleData.angles.length; i += 1) { lo.push(0); hi.push(Math.PI / 2); }
  for (const l of angleData.lengths) { lo.push(1); hi.push(Math.max(l * 3, 30)); }
  const bounds: BoundBox = { lo, hi };

  const baseS = sampleDense(cloned);
  const evalfn = (x: number[]) => {
    const c = deepClone(cloned);
    let ki = 0;
    for (const idx of knotIndices) {
      if (idx <= 0 || idx >= anchors.length - 1) continue;
      c[idx].position.timeSeconds = x[ki * 2]; c[idx].position.value = x[ki * 2 + 1]; ki++;
    }
    const angleLen = x.slice(knotBounds.length * 2);
    const fc = applyAngleParams(c, angleLen);
    return costFn(fc, events, phaseWindows(fc, events), sampleDense(fc), baseS);
  };

  const params = init.length <= 6 ? nelderMead(evalfn, init, maxIter) : coordinateDescent(evalfn, init, bounds, 40);

  const result = deepClone(cloned);
  let ki = 0;
  for (const idx of knotIndices) {
    if (idx <= 0 || idx >= anchors.length - 1) continue;
    result[idx].position.timeSeconds = params[ki * 2]; result[idx].position.value = params[ki * 2 + 1]; ki++;
  }
  const finalResult = applyAngleParams(result, params.slice(knotBounds.length * 2));
  finalResult[0].leftCtrl = { timeSeconds: 0, value: 0 };
  finalResult[finalResult.length - 1].rightCtrl = { timeSeconds: 0, value: 0 };

  const acc = acceptance(anchors, finalResult, events);
  return { optimized: acc.accepted ? finalResult : null, acceptance: acc };
}

/**
 * Scan for shock points suitable for free-knot optimization.
 */
export function scanKnotShocks(anchors: BezierAnchor[], events: Events) {
  const s = sampleDense(anchors);
  const windows = phaseWindows(anchors, events);
  const shock = knotShock(anchors, s, windows);
  return shock.perKnot
    .filter(e => e.shock > 2)
    .sort((a, b) => b.shock - a.shock)
    .slice(0, 3)
    .sort((a, b) => a.knotIndex - b.knotIndex)
    .map(e => ({
      knotIndex: e.knotIndex, timeSec: e.timeSec,
      tempC: anchors[e.knotIndex]?.position.value ?? 0,
      phase: e.phase, shock: e.shock
    }));
}

// ---- Utilities ----

function deepClone(anchors: BezierAnchor[]): BezierAnchor[] {
  return anchors.map(a => ({
    position: { ...a.position }, leftCtrl: { ...a.leftCtrl }, rightCtrl: { ...a.rightCtrl }
  }));
}
