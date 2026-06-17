import type { CurvePoint, KproProfile } from "@/lib/types";

export type RoastTarget = {
  t: number;
  T: number;
};

export type ProfileGeneratorInput = {
  fileName?: string;
  shortName: string;
  designer?: string | null;
  description?: string | null;
  startTemp: number;
  cc: RoastTarget;
  fc: RoastTarget;
  drop: RoastTarget;
  rorInterval: {
    startSec: number;
    endSec: number;
  };
  fan: {
    startRpm: number;
    descentRpm: number;
    descentOffsetSec: number;
  };
};

const DEFAULT_ROAST_LEVELS = [214.9, 216.5, 218, 219.5, 222, 224, 227.1];

export function generateKaffelogicProfile(input: ProfileGeneratorInput): KproProfile {
  validateGeneratorInput(input);
  const roastCurvePoints = generateTemperatureCurve(input);
  const fanCurvePoints = generateFanCurve(input);
  const roastLevels = adjustedRoastLevels(input.drop.T);
  const recommendedLevel = dropTempToRecommendedLevel(input.drop.T, roastLevels);
  const rorDecline = estimateRorDecline(roastCurvePoints, input.rorInterval.startSec, input.rorInterval.endSec);

  return {
    fileName: input.fileName ?? `${sanitizeName(input.shortName)}.kpro`,
    shortName: input.shortName,
    designer: input.designer ?? "Kaffelogic Roast Advisor",
    description: input.description ?? [
      "Generated from Start / CC / FC / Drop targets.",
      `CC ${formatSeconds(input.cc.t)} ${input.cc.T.toFixed(1)}C; FC ${formatSeconds(input.fc.t)} ${input.fc.T.toFixed(1)}C; Drop ${formatSeconds(input.drop.t)} ${input.drop.T.toFixed(1)}C.`,
      `RoR decline interval ${formatSeconds(input.rorInterval.startSec)}-${formatSeconds(input.rorInterval.endSec)}.`
    ].join("\n"),
    schemaVersion: "1.4",
    recommendedLevel,
    expectedFirstCrackTemp: round1(input.fc.T),
    expectedColourChangeTemp: round1(input.cc.T),
    roastLevels,
    roastCurvePoints,
    fanCurvePoints,
    rawFields: {
      profile_schema_version: "1.4",
      profile_generator: "kaffelogic-roast-advisor-target-generator",
      generator_start_temp: String(round1(input.startTemp)),
      generator_cc: `${input.cc.t},${round1(input.cc.T)}`,
      generator_fc: `${input.fc.t},${round1(input.fc.T)}`,
      generator_drop: `${input.drop.t},${round1(input.drop.T)}`,
      generator_ror_interval: `${input.rorInterval.startSec},${input.rorInterval.endSec}`,
      generator_fan: `${input.fan.startRpm},${input.fan.descentRpm},${input.fan.descentOffsetSec}`,
      generator_ror_decline_c_per_min: String(round1(rorDecline))
    }
  };
}

export function defaultProfileGeneratorInput(locale: "zh" | "en" = "zh"): ProfileGeneratorInput {
  return {
    shortName: locale === "zh" ? "目标生成曲线" : "Target Generated Profile",
    designer: "Kaffelogic Roast Advisor",
    startTemp: 33,
    cc: { t: 131, T: 155 },
    fc: { t: 326, T: 207 },
    drop: { t: 415, T: 216.8 },
    rorInterval: { startSec: 200, endSec: 400 },
    fan: { startRpm: 14700, descentRpm: 14200, descentOffsetSec: 5 }
  };
}

function validateGeneratorInput(input: ProfileGeneratorInput) {
  if (!input.shortName.trim()) throw new Error("Profile name is required.");
  if (input.startTemp < 0 || input.startTemp > 60) throw new Error("Start temperature must be between 0 and 60C.");
  if (!(input.cc.t < input.fc.t && input.fc.t < input.drop.t)) {
    throw new Error("Target times must follow Start < CC < FC < Drop.");
  }
  if (input.fc.t - input.cc.t < 15 || input.drop.t - input.fc.t < 15) {
    throw new Error("CC, FC and Drop targets need at least 15 seconds between them.");
  }
  if (input.cc.T <= input.startTemp || input.fc.T <= input.cc.T || input.drop.T <= input.fc.T) {
    throw new Error("Target temperatures must increase from Start to Drop.");
  }
  if (input.rorInterval.startSec < 0 || input.rorInterval.endSec > input.drop.t || input.rorInterval.startSec >= input.rorInterval.endSec) {
    throw new Error("RoR interval must sit inside the roast and end before Drop.");
  }
  if (input.fan.startRpm < 9000 || input.fan.startRpm > 18000 || input.fan.descentRpm < 9000 || input.fan.descentRpm > 18000) {
    throw new Error("Fan RPM must be between 9000 and 18000.");
  }
}

function generateTemperatureCurve(input: ProfileGeneratorInput): CurvePoint[] {
  const nodes = [
    { t: 0, T: input.startTemp },
    input.cc,
    input.fc,
    input.drop
  ];
  const segmentSlopes = nodes.slice(0, -1).map((node, index) => {
    const next = nodes[index + 1];
    return (next.T - node.T) / Math.max(next.t - node.t, 1);
  });
  const tangents = [
    segmentSlopes[0] * 1.34,
    Math.min(segmentSlopes[0], segmentSlopes[1]) * 0.82,
    Math.min(segmentSlopes[1], segmentSlopes[2]) * 0.62,
    segmentSlopes[2] * 0.34
  ];
  const points: CurvePoint[] = [];
  const step = input.drop.t <= 520 ? 15 : 20;

  for (let time = 0; time <= input.drop.t; time += step) {
    points.push({ timeSeconds: time, value: round1(sampleHermite(nodes, tangents, time)) });
  }
  if (points.at(-1)?.timeSeconds !== input.drop.t) {
    points.push({ timeSeconds: input.drop.t, value: round1(input.drop.T) });
  }

  return enforceMonotonic(points);
}

function sampleHermite(nodes: Array<{ t: number; T: number }>, tangents: number[], time: number) {
  const segmentIndex = Math.min(
    Math.max(nodes.findIndex((node, index) => index < nodes.length - 1 && time <= nodes[index + 1].t), 0),
    nodes.length - 2
  );
  const start = nodes[segmentIndex];
  const end = nodes[segmentIndex + 1];
  const duration = Math.max(end.t - start.t, 1);
  const ratio = Math.max(0, Math.min(1, (time - start.t) / duration));
  const h00 = 2 * ratio ** 3 - 3 * ratio ** 2 + 1;
  const h10 = ratio ** 3 - 2 * ratio ** 2 + ratio;
  const h01 = -2 * ratio ** 3 + 3 * ratio ** 2;
  const h11 = ratio ** 3 - ratio ** 2;
  return h00 * start.T + h10 * duration * tangents[segmentIndex] + h01 * end.T + h11 * duration * tangents[segmentIndex + 1];
}

function enforceMonotonic(points: CurvePoint[]) {
  let last = -Infinity;
  return points.map((point) => {
    const value = Math.max(point.value, last);
    last = value;
    return { ...point, value: round1(value) };
  });
}

function generateFanCurve(input: ProfileGeneratorInput): CurvePoint[] {
  const descentTime = Math.max(0, input.fc.t - input.fan.descentOffsetSec);
  const settleTime = Math.max(0, Math.round(descentTime * 0.57));
  const releaseTime = Math.max(descentTime + 1, input.drop.t + 170);
  return [
    { timeSeconds: 0, value: input.fan.startRpm },
    { timeSeconds: settleTime, value: input.fan.startRpm },
    { timeSeconds: descentTime, value: input.fan.descentRpm },
    { timeSeconds: releaseTime, value: input.fan.descentRpm }
  ];
}

function adjustedRoastLevels(dropTemp: number) {
  const levels = [...DEFAULT_ROAST_LEVELS];
  if (dropTemp <= levels[0]) levels[0] = round1(dropTemp - 2);
  if (dropTemp >= levels[levels.length - 1]) levels[levels.length - 1] = round1(dropTemp + 2);
  return levels;
}

function dropTempToRecommendedLevel(dropTemp: number, levels: number[]) {
  if (dropTemp <= levels[0]) return 0;
  for (let index = 0; index < levels.length - 1; index += 1) {
    const current = levels[index];
    const next = levels[index + 1];
    if (dropTemp <= next) {
      return round3(index + (dropTemp - current) / Math.max(next - current, 0.1));
    }
  }
  return levels.length - 1;
}

function estimateRorDecline(points: CurvePoint[], startSec: number, endSec: number) {
  const start = estimateRor(points, startSec);
  const end = estimateRor(points, endSec);
  return start - end;
}

function estimateRor(points: CurvePoint[], timeSeconds: number) {
  const before = interpolate(points, Math.max(0, timeSeconds - 15));
  const after = interpolate(points, Math.min(points.at(-1)?.timeSeconds ?? timeSeconds, timeSeconds + 15));
  return ((after - before) / 30) * 60;
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

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function round3(value: number) {
  return Math.round(value * 1000) / 1000;
}

function formatSeconds(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${Math.round(seconds % 60).toString().padStart(2, "0")}`;
}

function sanitizeName(value: string) {
  return value.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]+/g, "_").replace(/^_+|_+$/g, "") || "generated-profile";
}
