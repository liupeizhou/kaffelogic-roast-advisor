import type { CurvePoint, KproProfile } from "@/lib/types";

const NUMBER_RE = /^-?\d+(\.\d+)?$/;

export function detectKpro(fileName: string, text: string): boolean {
  return fileName.toLowerCase().endsWith(".kpro") || text.includes("profile_short_name:") || text.includes("roast_profile:");
}

export function parseKpro(text: string, fileName = "uploaded.kpro"): KproProfile {
  const fields: Record<string, string> = {};

  for (const line of text.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key) fields[key] = normalizeText(value);
  }

  return {
    fileName,
    shortName: emptyToNull(fields.profile_short_name),
    designer: emptyToNull(fields.profile_designer),
    description: emptyToNull(fields.profile_description),
    schemaVersion: emptyToNull(fields.profile_schema_version),
    recommendedLevel: parseOptionalNumber(fields.recommended_level),
    expectedFirstCrackTemp: parseOptionalNumber(fields.expect_fc),
    expectedColourChangeTemp: parseOptionalNumber(fields.expect_colrchange),
    roastLevels: parseNumberList(fields.roast_levels),
    roastCurvePoints: parseCurvePoints(fields.roast_profile, "temperature"),
    fanCurvePoints: parseCurvePoints(fields.fan_profile, "fan"),
    rawFields: fields
  };
}

export function serializeKpro(profile: KproProfile): string {
  const fields: Record<string, string> = {
    ...profile.rawFields,
    profile_short_name: profile.shortName ?? "",
    profile_designer: profile.designer ?? "",
    profile_description: profile.description ?? "",
    recommended_level: numberToField(profile.recommendedLevel),
    expect_fc: numberToField(profile.expectedFirstCrackTemp),
    expect_colrchange: numberToField(profile.expectedColourChangeTemp),
    roast_levels: profile.roastLevels.map((value) => numberToField(value)).join(","),
    roast_profile: curveToField(profile.roastCurvePoints),
    fan_profile: curveToField(profile.fanCurvePoints)
  };
  if (profile.schemaVersion && !fields.profile_schema_version) {
    fields.profile_schema_version = profile.schemaVersion;
  }

  const orderedKeys = [
    "profile_short_name",
    "profile_designer",
    "profile_description",
    "profile_schema_version",
    "recommended_level",
    "expect_fc",
    "expect_colrchange",
    "roast_levels",
    "roast_profile",
    "fan_profile"
  ];
  const keys = [
    ...orderedKeys.filter((key) => key in fields),
    ...Object.keys(fields).filter((key) => !orderedKeys.includes(key)).sort()
  ];
  return `${keys.map((key) => `${key}:${denormalizeText(fields[key] ?? "")}`).join("\n")}\n`;
}

export function normalizeText(value = ""): string {
  return value.replace(/\\v/g, "\n").replace(/\u000b/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
}

export function denormalizeText(value = ""): string {
  return value.replace(/\r?\n/g, "\\v");
}

export function parseOptionalNumber(value?: string): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!NUMBER_RE.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseNumberList(value?: string): number[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item));
}

export function parseCurvePoints(value?: string, kind: "temperature" | "fan" = "temperature"): CurvePoint[] {
  const numbers = parseNumberList(value);
  const points: CurvePoint[] = [];
  const maxValue = kind === "fan" ? 25000 : 260;
  let lastTime = -Infinity;

  for (let i = 0; i < numbers.length - 1; i += 2) {
    const timeSeconds = numbers[i];
    const next = numbers[i + 1];
    const plausibleTime = timeSeconds >= 0 && timeSeconds <= 2400 && timeSeconds >= lastTime;
    const plausibleValue = next >= 0 && next <= maxValue;

    if (plausibleTime && plausibleValue) {
      points.push({ timeSeconds, value: next });
      lastTime = timeSeconds;
    }
  }

  return points;
}

function curveToField(points: CurvePoint[]) {
  return points
    .flatMap((point) => [numberToField(point.timeSeconds), numberToField(point.value)])
    .join(",");
}

function numberToField(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  return Number.isInteger(value) ? value.toFixed(1) : `${Number(value.toFixed(3))}`;
}

export function inferProfileTags(profile: KproProfile) {
  const source = `${profile.fileName} ${profile.shortName ?? ""} ${profile.description ?? ""}`.toLowerCase();
  const targetBrew = source.includes("espresso") || source.includes("soe") ? "espresso" : source.includes("cupping") ? "cupping" : "filter";
  const processFit = source.includes("washed") || source.includes("wsh")
    ? "washed"
    : source.includes("natural") || source.includes("_n") || source.includes(" n ")
      ? "natural"
      : source.includes("honey")
        ? "honey"
        : source.includes("decaf")
          ? "decaf"
          : source.includes("robusta")
            ? "robusta"
            : "any";

  const altitudeMatch = source.match(/(\d{3,4})m?\s*[-–]\s*(\d{3,4})m?/);
  const altitudeRange = altitudeMatch
    ? { min: Number(altitudeMatch[1]), max: Number(altitudeMatch[2]) }
    : null;

  const sourceType = source.includes("kaffelogic") ? "official" : source.includes("c lab") ? "clab" : source.includes("maotiao") ? "community" : "uploaded";

  return {
    sourceType,
    targetBrew,
    processFit,
    altitudeRange
  };
}

function emptyToNull(value?: string): string | null {
  if (!value) return null;
  return value.trim() ? value.trim() : null;
}
