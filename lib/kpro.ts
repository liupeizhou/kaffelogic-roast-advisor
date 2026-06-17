import type { BezierAnchor, CurvePoint, KproProfile } from "@/lib/types";
import { crossingTime, sampleBezierAnchors } from "@/lib/curve-bezier";

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

  const anchors = parseAnchorsFromProfile(fields.roast_profile);
  const expectedFirstCrackTemp = parseOptionalNumber(fields.expect_fc);
  const expectedColourChangeTemp = parseOptionalNumber(fields.expect_colrchange);
  const roastCurvePoints = anchors
    ? sampleRoastProfileAnchors(anchors, fields, { expectedColourChangeTemp, expectedFirstCrackTemp })
    : parseCurvePoints(fields.roast_profile, "temperature");

  return {
    fileName,
    shortName: emptyToNull(fields.profile_short_name),
    designer: emptyToNull(fields.profile_designer),
    description: emptyToNull(fields.profile_description),
    schemaVersion: emptyToNull(fields.profile_schema_version),
    recommendedLevel: parseOptionalNumber(fields.recommended_level),
    expectedFirstCrackTemp,
    expectedColourChangeTemp,
    roastLevels: parseNumberList(fields.roast_levels),
    roastCurvePoints,
    fanCurvePoints: parseCurvePoints(fields.fan_profile, "fan"),
    anchors,
    rawFields: fields
  };
}

/**
 * Reconstruct Bezier anchors from a Kaffelogic STD2 roast_profile field.
 */
function parseAnchorsFromProfile(value?: string): BezierAnchor[] | undefined {
  if (!value) return undefined;
  const numbers = parseNumberList(value);
  if (numbers.length < 24 || numbers.length % 6 !== 0) return undefined;

  const anchors: BezierAnchor[] = [];
  for (let i = 0; i < numbers.length; i += 6) {
    anchors.push({
      position: { timeSeconds: numbers[i], value: numbers[i + 1] },
      leftCtrl:  { timeSeconds: numbers[i + 2], value: numbers[i + 3] },
      rightCtrl: { timeSeconds: numbers[i + 4], value: numbers[i + 5] }
    });
  }
  return anchors.length >= 2 ? anchors : undefined;
}

function sampleRoastProfileAnchors(
  anchors: BezierAnchor[],
  fields: Record<string, string>,
  expected: { expectedColourChangeTemp: number | null; expectedFirstCrackTemp: number | null }
): CurvePoint[] {
  const { tempPoints } = sampleBezierAnchors(anchors, 15);
  const merged = new Map(tempPoints.map((point) => [point.timeSeconds, point.value]));

  for (const milestone of [
    parseGeneratedMilestone(fields.generator_cc),
    parseGeneratedMilestone(fields.generator_fc),
    parseGeneratedMilestone(fields.generator_drop)
  ]) {
    if (milestone) merged.set(milestone.timeSeconds, milestone.value);
  }

  if (!fields.generator_cc) addCrossingPoint(merged, tempPoints, expected.expectedColourChangeTemp);
  if (!fields.generator_fc) addCrossingPoint(merged, tempPoints, expected.expectedFirstCrackTemp);

  return [...merged.entries()]
    .map(([timeSeconds, value]) => ({ timeSeconds, value }))
    .sort((a, b) => a.timeSeconds - b.timeSeconds);
}

function parseGeneratedMilestone(value?: string): CurvePoint | null {
  const numbers = parseNumberList(value);
  if (numbers.length < 2) return null;
  const [timeSeconds, temperature] = numbers;
  if (!Number.isFinite(timeSeconds) || !Number.isFinite(temperature)) return null;
  return { timeSeconds, value: temperature };
}

function addCrossingPoint(merged: Map<number, number>, points: CurvePoint[], targetTemp: number | null) {
  if (targetTemp === null) return;
  const timeSeconds = crossingTime(points, targetTemp);
  if (timeSeconds !== null) merged.set(timeSeconds, targetTemp);
}

export function serializeKpro(profile: KproProfile): string {
  const roastProfileField = profile.anchors && profile.anchors.length >= 4
    ? anchorsToField(profile.anchors)
    : curveToField(profile.roastCurvePoints);

  const fields: Record<string, string> = {
    ...profile.rawFields,
    profile_short_name: profile.shortName ?? "",
    profile_designer: profile.designer ?? "",
    profile_description: profile.description ?? "",
    emulation_mode: "0.0",
    recommended_level: numberToField(profile.recommendedLevel),
    expect_fc: numberToField(profile.expectedFirstCrackTemp),
    expect_colrchange: numberToField(profile.expectedColourChangeTemp),
    roast_levels: profile.roastLevels.map((value) => numberToField(value)).join(","),
    roast_profile: roastProfileField,
    fan_profile: curveToField(profile.fanCurvePoints)
  };

  // Inject preheat / PID / zone fields from rawFields if present, else use safe defaults
  if (!fields.preheat_power) fields.preheat_power = "1100.0";
  if (!fields.preheat_nominal_temperature) fields.preheat_nominal_temperature = "240.0";
  if (!fields.preheat_mode) fields.preheat_mode = "5.0";
  if (!fields.roast_required_power) fields.roast_required_power = "1200.0";
  if (!fields.roast_PID_Kp) fields.roast_PID_Kp = "0.7172";
  if (!fields.roast_PID_Ki) fields.roast_PID_Ki = "0.0";
  if (!fields.roast_PID_Kd) fields.roast_PID_Kd = "3.55";
  if (!fields.roast_target_in_future) fields.roast_target_in_future = "25.0";
  if (!fields.roast_use_prediction_method) fields.roast_use_prediction_method = "1.0";
  if (!fields.roast_target_timeshift) fields.roast_target_timeshift = "1.0";
  if (!fields.roast_end_by_time_ratio) fields.roast_end_by_time_ratio = "1.0";
  if (!fields.cooldown_hi_speed) fields.cooldown_hi_speed = "16500.0";
  if (!fields.cooldown_lo_speed) fields.cooldown_lo_speed = "15500.0";
  if (!fields.cooldown_lo_temperature) fields.cooldown_lo_temperature = "100.0";

  if (profile.schemaVersion && !fields.profile_schema_version) {
    fields.profile_schema_version = profile.schemaVersion;
  }

  const orderedKeys = [
    "profile_short_name",
    "profile_designer",
    "profile_description",
    "profile_schema_version",
    "emulation_mode",
    "recommended_level",
    "expect_fc",
    "expect_colrchange",
    "roast_levels",
    "preheat_power",
    "preheat_nominal_temperature",
    "preheat_mode",
    "roast_required_power",
    "roast_PID_Kp",
    "roast_PID_Ki",
    "roast_PID_Kd",
    "roast_target_in_future",
    "roast_use_prediction_method",
    "roast_target_timeshift",
    "roast_end_by_time_ratio",
    "cooldown_hi_speed",
    "cooldown_lo_speed",
    "cooldown_lo_temperature",
    "roast_profile",
    "fan_profile"
  ];
  const keys = [
    ...orderedKeys.filter((key) => key in fields),
    ...Object.keys(fields).filter((key) => !orderedKeys.includes(key)).sort()
  ];
  return `${keys.map((key) => `${key}:${denormalizeText(fields[key] ?? "")}`).join("\n")}\n`;
}

/**
 * Serialize Bezier anchors to Kaffelogic STD2 profile format.
 * Each anchor: pos.t, pos.T, lCtrl.t, lCtrl.T, rCtrl.t, rCtrl.T
 */
function anchorsToField(anchors: import("@/lib/types").BezierAnchor[]): string {
  const parts: string[] = [];
  for (let i = 0; i < anchors.length; i += 1) {
    const a = anchors[i];
    const isFirst = i === 0;
    const isLast = i === anchors.length - 1;
    parts.push(
      a.position.timeSeconds.toFixed(4),
      a.position.value.toFixed(4),
      isFirst ? "0" : a.leftCtrl.timeSeconds.toFixed(4),
      isFirst ? "0" : a.leftCtrl.value.toFixed(4),
      isLast ? "0" : a.rightCtrl.timeSeconds.toFixed(4),
      isLast ? "0" : a.rightCtrl.value.toFixed(4)
    );
  }
  return parts.join(",");
}

export function normalizeText(value = ""): string {
  return value.replace(/\\v/g, "\n").replace(/\u000b/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
}

export function denormalizeText(value = ""): string {
  return value.replace(/\r?\n/g, "\\v");
}

// Kaffelogic Studio field groups (from kaffelogic_studio_defaults.py)
// Fields not saved in profile data — informational only
export const LOG_ONLY_FIELDS = new Set([
  "profile_file_name", "profile_modified", "native_schema_version", "roasting_level",
  "colour_change", "first_crack", "first_crack_end", "second_crack", "second_crack_end",
  "roast_end", "development_percent", "tasting_notes", "model", "firmware_version",
  "motor_hours", "heater_hours", "ambient_temperature", "mains_voltage",
  "heater_power_available", "power_factor", "density_factor", "reference_temperature",
  "back2back_count", "time_jump", "preheat_heater_percent", "calibration_data",
  "ambient_cutoff_reference", "ambient_cutoff_probe", "ambient_cutoff_difference",
  "ambient_default_temperature", "cooldown_end_temperature", "cooldown_end_ror_1st",
  "cooldown_end_ror_b2b", "cooldown_slow_time"
]);

// Fields displayed in min:sec format in Studio
export const TIME_FIELDS = new Set([
  "time_jump", "preheat_min_time", "preheat_max_time", "preheat_check_gradient_time",
  "preheat_target_in_future", "roast_target_in_future", "roast_target_timeshift",
  ...["zone1_time_start", "zone1_time_end", "zone2_time_start", "zone2_time_end",
     "zone3_time_start", "zone3_time_end", "corner1_time_start", "corner1_time_end"],
  ...["colour_change", "first_crack", "first_crack_end", "second_crack", "second_crack_end", "roast_end"]
]);

// Temperature parameters (always °C internally, displayed per unit preference)
export const TEMPERATURE_FIELDS = new Set([
  "expect_fc", "expect_colrchange", "preheat_nominal_temperature",
  "specific_heat_adj_upper_temperature_limit", "specific_heat_adj_lower_temperature_limit",
  "cooldown_lo_temperature", "ambient_temperature", "reference_temperature",
  "ambient_cutoff_reference", "ambient_cutoff_probe", "ambient_default_temperature",
  "cooldown_end_temperature"
]);

// Temperature delta parameters (rate-of-change, proximity thresholds)
export const TEMPERATURE_DELTA_FIELDS = new Set([
  "preheat_temperature_proximity", "roast_min_desired_rate_of_rise",
  "ambient_cutoff_difference", "cooldown_end_ror_1st", "cooldown_end_ror_b2b"
]);

// User-editable metadata
export const METADATA_FIELDS = new Set([
  "profile_short_name", "profile_designer", "profile_description"
]);

// Machine control settings (PID, zones, boost)
export const CONTROL_FIELDS = new Set([
  "zone1_time_start", "zone1_time_end", "zone1_multiplier_Kp", "zone1_multiplier_Kd", "zone1_boost",
  "zone2_time_start", "zone2_time_end", "zone2_multiplier_Kp", "zone2_multiplier_Kd", "zone2_boost",
  "zone3_time_start", "zone3_time_end", "zone3_multiplier_Kp", "zone3_multiplier_Kd", "zone3_boost",
  "corner1_time_start", "corner1_time_end"
]);

/**
 * Filter rawFields into editor-visible vs internal groups.
 */
export function filterEditorFields(rawFields: Record<string, string>): {
  metadata: Record<string, string>;
  phases: Record<string, string>;
  controls: Record<string, string>;
  internal: Record<string, string>;
} {
  const metadata: Record<string, string> = {};
  const phases: Record<string, string> = {};
  const controls: Record<string, string> = {};
  const internal: Record<string, string> = {};
  for (const [key, value] of Object.entries(rawFields)) {
    if (METADATA_FIELDS.has(key)) metadata[key] = value;
    else if (key === "recommended_level" || key === "expect_fc" || key === "expect_colrchange" || key === "roast_levels") phases[key] = value;
    else if (CONTROL_FIELDS.has(key)) controls[key] = value;
    else if (!LOG_ONLY_FIELDS.has(key)) internal[key] = value;
  }
  return { metadata, phases, controls, internal };
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
  // Detect Bezier anchor format: each anchor has 6 values (pos.t, pos.T, leftCtrl.t, leftCtrl.T, rightCtrl.t, rightCtrl.T)
  if (numbers.length >= 24 && numbers.length % 6 === 0) {
    return parseBezierAnchorPoints(numbers, kind);
  }
  // Legacy point-pair format
  return parseLegacyPoints(numbers, kind);
}

function parseBezierAnchorPoints(numbers: number[], kind: "temperature" | "fan"): CurvePoint[] {
  const maxValue = kind === "fan" ? 25000 : 260;
  const points: CurvePoint[] = [];
  let lastTime = -Infinity;

  for (let i = 0; i < numbers.length; i += 6) {
    const t = numbers[i];
    const T = numbers[i + 1];
    if (t >= 0 && t <= 2400 && t > lastTime && T >= 0 && T <= maxValue) {
      points.push({ timeSeconds: t, value: T });
      lastTime = t;
    }
  }
  return points;
}

function parseLegacyPoints(numbers: number[], kind: "temperature" | "fan"): CurvePoint[] {
  const maxValue = kind === "fan" ? 25000 : 260;
  const points: CurvePoint[] = [];
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
