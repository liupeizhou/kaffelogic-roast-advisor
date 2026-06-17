/**
 * PathFitter — Schneider 1990 curve-fitting algorithm.
 * Fits cubic Bezier segments to ordered (time, temp) point arrays.
 *
 * Ported from Kaffelogic Studio's PathFitter.py
 * which was itself ported from Paper.js
 *   Copyright (c) 2011-2014, Juerg Lehni & Jonathan Puckey
 *   "An Algorithm for Automatically Fitting Digitized Curves"
 *   by Philip J. Schneider, Graphics Gems, Academic Press, 1990
 */

type Point = { x: number; y: number };

const TOLERANCE = 1e-5;
const EPSILON = 1e-12;

// ---- Vector math ----

function sub(a: Point, b: Point): Point { return { x: a.x - b.x, y: a.y - b.y }; }
function add(a: Point, b: Point): Point { return { x: a.x + b.x, y: a.y + b.y }; }
function mul(p: Point, s: number): Point { return { x: p.x * s, y: p.y * s }; }
function div(p: Point, s: number): Point { return { x: p.x / s, y: p.y / s }; }
function len(p: Point): number { return Math.hypot(p.x, p.y); }
function dot(a: Point, b: Point): number { return a.x * b.x + a.y * b.y; }
function normalize(p: Point, l = 1): Point { const n = len(p); return n !== 0 ? mul(p, l / n) : { x: 0, y: 0 }; }
function neg(p: Point): Point { return { x: -p.x, y: -p.y }; }
function dist(a: Point, b: Point): number { return len(sub(a, b)); }

// ---- Segment (Bezier control points) ----

export type PathFitterSegment = {
  point: Point;       // anchor position
  handleIn: Point;    // left control (offset from point)
  handleOut: Point;   // right control (offset from point)
};

// ---- Chord-length parameterization ----

function chordLength(points: Point[], first: number, last: number): number[] {
  const u: number[] = [0];
  for (let i = first + 1; i <= last; i++) {
    u[i - first] = u[i - first - 1] + dist(points[i], points[i - 1]);
  }
  const m = last - first;
  for (let i = 1; i <= m; i++) u[i] /= u[m];
  return u;
}

// ---- De Casteljau evaluation ----

function evaluate(curve: Point[], t: number): Point {
  const tmp = curve.map(p => ({ x: p.x, y: p.y })); // ponytail: copy
  const n = tmp.length;
  for (let i = 1; i < n; i++) {
    for (let j = 0; j < n - i; j++) {
      tmp[j] = { x: tmp[j].x * (1 - t) + tmp[j + 1].x * t, y: tmp[j].y * (1 - t) + tmp[j + 1].y * t };
    }
  }
  return tmp[0];
}

// ---- Newton-Raphson root finding ----

function findRoot(curve: Point[], point: Point, u: number): number {
  // Control vertices for first and second derivatives
  const curve1 = [mul(sub(curve[1], curve[0]), 3), mul(sub(curve[2], curve[1]), 3), mul(sub(curve[3], curve[2]), 3)];
  const curve2 = [mul(sub(curve1[1], curve1[0]), 2), mul(sub(curve1[2], curve1[1]), 2)];

  const pt = evaluate(curve, u);
  const pt1 = evaluate(curve1, u);
  const pt2 = evaluate(curve2, u);
  const diff = sub(pt, point);
  const df = dot(pt1, pt1) + dot(diff, pt2);

  if (Math.abs(df) < TOLERANCE) return u;
  return u - dot(diff, pt1) / df;
}

// ---- Least-squares Bezier fit for a segment ----

function generateBezier(
  points: Point[], first: number, last: number, uPrime: number[],
  tan1: Point, tan2: Point
): Point[] {
  const pt1 = points[first], pt2 = points[last];
  const C: number[][] = [[0, 0], [0, 0]];
  const X: number[] = [0, 0];
  const n = last - first + 1;

  for (let i = 0; i < n; i++) {
    const u = uPrime[i], t = 1 - u;
    const b = 3 * u * t;
    const b0 = t * t * t, b1 = b * t, b2 = b * u, b3 = u * u * u;
    const a1 = normalize(tan1, b1), a2 = normalize(tan2, b2);
    const tmp = sub(sub(points[first + i], mul(pt1, b0 + b1)), mul(pt2, b2 + b3));
    C[0][0] += dot(a1, a1); C[0][1] += dot(a1, a2);
    C[1][0] = C[0][1]; C[1][1] += dot(a2, a2);
    X[0] += dot(a1, tmp); X[1] += dot(a2, tmp);
  }

  const detC0C1 = C[0][0] * C[1][1] - C[1][0] * C[0][1];
  let alpha1: number, alpha2: number;

  if (Math.abs(detC0C1) > EPSILON) {
    // Kramer's rule
    const detC0X = C[0][0] * X[1] - C[1][0] * X[0];
    const detXC1 = X[0] * C[1][1] - X[1] * C[0][1];
    alpha1 = detXC1 / detC0C1;
    alpha2 = detC0X / detC0C1;
  } else {
    const c0 = C[0][0] + C[0][1], c1 = C[1][0] + C[1][1];
    alpha1 = alpha2 = Math.abs(c0) > EPSILON ? X[0] / c0 : Math.abs(c1) > EPSILON ? X[1] / c1 : 0;
  }

  const segLen = dist(pt1, pt2);
  const eps = EPSILON * segLen;
  if (alpha1 < eps || alpha2 < eps) {
    alpha1 = alpha2 = segLen / 3;
  }

  return [pt1, add(pt1, normalize(tan1, alpha1)), add(pt2, normalize(tan2, alpha2)), pt2];
}

// ---- Max error finder ----

function findMaxError(
  points: Point[], first: number, last: number, curve: Point[], u: number[]
): { maxDist: number; index: number } {
  let index = Math.floor((last - first + 1) / 2);
  let maxDist = 0;
  for (let i = first + 1; i < last; i++) {
    const P = evaluate(curve, u[i - first]);
    const v = sub(P, points[i]);
    const d = v.x * v.x + v.y * v.y;
    if (d >= maxDist) { maxDist = d; index = i; }
  }
  return { maxDist, index };
}

// ---- Recursive cubic fit ----

function fitCubic(
  segments: PathFitterSegment[], points: Point[], first: number, last: number,
  tan1: Point, tan2: Point, error: number
) {
  if (last - first === 1) {
    const pt1 = points[first], pt2 = points[last];
    const d = dist(pt1, pt2) / 3;
    const prev = segments[segments.length - 1];
    prev.handleOut = sub(add(pt1, normalize(tan1, d)), prev.point);
    segments.push({ point: pt2, handleIn: sub(add(pt2, normalize(tan2, d)), pt2), handleOut: { x: 0, y: 0 } });
    return;
  }

  const uPrime = chordLength(points, first, last);
  let maxError = Math.max(error, error * error);

  for (let iter = 0; iter < 5; iter++) {
    const curve = generateBezier(points, first, last, uPrime, tan1, tan2);
    const { maxDist } = findMaxError(points, first, last, curve, uPrime);

    if (maxDist < error * error) {
      const prev = segments[segments.length - 1];
      prev.handleOut = sub(curve[1], prev.point);
      segments.push({ point: curve[3], handleIn: sub(curve[2], curve[3]), handleOut: { x: 0, y: 0 } });
      return;
    }

    if (maxDist >= maxError) break;

    // Reparameterize
    for (let i = first; i <= last; i++) {
      uPrime[i - first] = findRoot(curve, points[i], uPrime[i - first]);
    }
    maxError = maxDist;
  }

  // Split at max error
  const index = findMaxError(points, first, last, generateBezier(points, first, last, uPrime, tan1, tan2), uPrime).index;
  const V1 = sub(points[index - 1], points[index]);
  const V2 = sub(points[index], points[index + 1]);
  const tanCenter = normalize(div(add(V1, V2), 2));
  fitCubic(segments, points, first, index, tan1, tanCenter, error);
  fitCubic(segments, points, index, last, neg(tanCenter), tan2, error);
}

// ---- Public API ----

/**
 * Fit cubic Bezier segments to an ordered array of (time, temp) points.
 * Returns segments: each segment is { point: anchor, handleIn, handleOut }.
 * handleIn/Out are OFFSETS from the anchor point.
 */
export function fitPath(
  points: Array<{ timeSeconds: number; value: number }>,
  error = 2.5
): PathFitterSegment[] {
  if (points.length < 2) return [];

  const pts: Point[] = points.map(p => ({ x: p.timeSeconds, y: p.value }));

  // Remove adjacent duplicates
  const deduped: Point[] = [];
  for (const p of pts) {
    const prev = deduped[deduped.length - 1];
    if (!prev || prev.x !== p.x || prev.y !== p.y) deduped.push(p);
  }
  if (deduped.length < 2) return [];

  const segments: PathFitterSegment[] = [{ point: deduped[0], handleIn: { x: 0, y: 0 }, handleOut: { x: 0, y: 0 } }];

  const first = 0, last = deduped.length - 1;
  const tan1 = normalize(sub(deduped[1], deduped[first]));
  const tan2 = normalize(sub(deduped[last - 1], deduped[last]));

  fitCubic(segments, deduped, first, last, tan1, tan2, error);
  return segments;
}

/**
 * Convert PathFitter segments to BezierAnchor format used by the rest of the app.
 */
export function segmentsToAnchors(segments: PathFitterSegment[]): Array<{
  position: { timeSeconds: number; value: number };
  leftCtrl: { timeSeconds: number; value: number };
  rightCtrl: { timeSeconds: number; value: number };
}> {
  return segments.map(s => ({
    position: { timeSeconds: s.point.x, value: s.point.y },
    leftCtrl: {
      timeSeconds: s.point.x + s.handleIn.x,
      value: s.point.y + s.handleIn.y
    },
    rightCtrl: {
      timeSeconds: s.point.x + s.handleOut.x,
      value: s.point.y + s.handleOut.y
    }
  }));
}
