import type { ProfileOrientation } from "@/lib/types";

export type CurveReferenceRecord = {
  refDropTime: number;
  refDropTemp: number;
  refCcTemp: number;
  refFcTemp: number;
  ccQ: number;
  fcQ: number;
  startRor: number;
  ccRor: number;
  fcRor: number;
  dropRor: number;
  post60Ror: number;
  post120Ror: number;
};

let sparseData: CurveReferenceRecord[] | null = null;

/**
 * Load the sparse reference table from the public directory.
 */
export async function loadSparseReferenceTable(): Promise<CurveReferenceRecord[]> {
  if (sparseData) return sparseData;
  try {
    const response = await fetch("/curve-reference-sparse.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    sparseData = (await response.json()) as CurveReferenceRecord[];
    return sparseData;
  } catch {
    sparseData = [];
    return sparseData;
  }
}

/**
 * Filter records by orientation drying ratio range.
 */
function filterOrientation(
  records: CurveReferenceRecord[],
  orientation: ProfileOrientation
): CurveReferenceRecord[] {
  const lo = orientation === "Espresso" ? 37 : 41;
  const hi = orientation === "Espresso" ? 48 : 55;
  return records.filter((r) => {
    const d = r.ccQ * 100;
    return d >= lo && d <= hi;
  });
}

/**
 * Find the closest reference record for a given (dropTime, dropTemp, orientation).
 * Brute-force nearest-neighbor: 2009 records × query = 35ms. Fast enough, no index needed.
 */
export function findClosestReference(
  dropTime: number,
  dropTemp: number,
  orientation: ProfileOrientation = "Filter",
  records: CurveReferenceRecord[] = []
): CurveReferenceRecord | null {
  if (records.length === 0) return null;

  // Narrow window for orientation-correct results
  const filtered = filterOrientation(records, orientation);
  const searchSet = filtered.length > 0 ? filtered : records;

  let best: CurveReferenceRecord | null = null;
  let bestScore = Infinity;
  for (const r of searchSet) {
    const dTime = (r.refDropTime - dropTime) / 5;
    const dTemp = (r.refDropTemp - dropTemp) / 0.5;
    const score = dTime * dTime + dTemp * dTemp;
    if (score < bestScore) { bestScore = score; best = r; }
  }

  return best;
}

/**
 * Predict CC and FC temperatures from a reference record.
 */
export function predictLandmarks(ref: CurveReferenceRecord): {
  ccTemp: number;
  fcTemp: number;
  ccTime: number;
  fcTime: number;
  startRor: number;
  fcRor: number;
  dropRor: number;
} {
  return {
    ccTemp: round1(ref.refCcTemp),
    fcTemp: round1(ref.refFcTemp),
    ccTime: Math.round(ref.refDropTime * ref.ccQ),
    fcTime: Math.round(ref.refDropTime * ref.fcQ),
    startRor: round1(ref.startRor),
    fcRor: round1(ref.fcRor),
    dropRor: round1(ref.dropRor)
  };
}

/**
 * Estimate orientation by analyzing DTR and drying ratio.
 */
export function estimateOrientation(
  dryingRatio: number,
  dtr: number
): ProfileOrientation {
  // Espresso tends to have shorter drying and longer DTR
  if (dtr > 20 && dryingRatio < 45) return "Espresso";
  if (dtr < 18 || dryingRatio > 45) return "Filter";
  // Borderline: check the spread
  return dtr + dryingRatio < 65 ? "Espresso" : "Filter";
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
