import type { CurvePoint, KproProfile } from "@/lib/types";
import { sampleBezierAnchors, round1, round3 } from "@/lib/curve-bezier";

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

  // Build 5-anchor Bezier curves for the temperature profile
  const anchors = buildTemperatureAnchors(input);
  const { tempPoints } = sampleBezierAnchors(anchors, input.drop.t <= 520 ? 15 : 20);

  const roastCurvePoints = enforceMilestones(enforceMonotonic(tempPoints), input);
  const fanCurvePoints = generateFanCurve(input);
  const roastLevels = adjustedRoastLevels(input.drop.T);
  const recommendedLevel = dropTempToRecommendedLevel(input.drop.T, roastLevels);
  const rorDecline = estimateRorDecline(roastCurvePoints, input.rorInterval);
  const adjustmentNodes = buildAdjustmentNodes(input, roastCurvePoints);
  const safetyNotes = getGeneratorSafetyNotes(input);
  const dtr = ((input.drop.t - input.fc.t) / input.drop.t) * 100;

  return {
    fileName: input.fileName ?? `${sanitizeName(input.shortName)}.kpro`,
    shortName: input.shortName,
    designer: input.designer ?? "Kaffelogic Roast Advisor",
    description: input.description ?? [
      "Generated from Start / CC / FC / Drop targets with Bezier smoothing.",
      `CC ${formatSeconds(input.cc.t)} ${input.cc.T.toFixed(1)}C; FC ${formatSeconds(input.fc.t)} ${input.fc.T.toFixed(1)}C; Drop ${formatSeconds(input.drop.t)} ${input.drop.T.toFixed(1)}C.`,
      `DTR ${dtr.toFixed(1)}%; RoR interval ${formatSeconds(input.rorInterval.startSec)}–${formatSeconds(input.rorInterval.endSec)}.`
    ].join("\n"),
    schemaVersion: "1.4",
    recommendedLevel,
    expectedFirstCrackTemp: round1(input.fc.T),
    expectedColourChangeTemp: round1(input.cc.T),
    roastLevels,
    roastCurvePoints,
    fanCurvePoints,
    anchors,
    rawFields: {
      profile_schema_version: "1.4",
      profile_generator: "kaffelogic-roast-advisor-bezier-generator",
      generator_start_temp: String(round1(input.startTemp)),
      generator_cc: `${input.cc.t},${round1(input.cc.T)}`,
      generator_fc: `${input.fc.t},${round1(input.fc.T)}`,
      generator_drop: `${input.drop.t},${round1(input.drop.T)}`,
      generator_ror_interval: `${input.rorInterval.startSec},${input.rorInterval.endSec}`,
      generator_fan: `${input.fan.startRpm},${input.fan.descentRpm},${input.fan.descentOffsetSec}`,
      generator_ror_decline_c_per_min: String(round1(rorDecline)),
      generator_dtr: String(round1(dtr)),
      generator_adjustment_nodes: adjustmentNodes.map((n) => `${n.label}@${n.timeSeconds}s/${n.temperatureC}C`).join("; "),
      generator_preheat_policy: "Nano 7 no preheat: add green coffee, fit chaff collector, then start roast.",
      generator_fan_preview_required: "true",
      generator_safety_notes: safetyNotes.join(" | ")
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

export function getGeneratorSafetyNotes(input: ProfileGeneratorInput, locale: "zh" | "en" = "zh"): string[] {
  const zh = locale === "zh";
  const notes = zh ? [
    "Nano 7 不需要预热：先入生豆、盖好银皮桶，再直接启动烘焙；Start Temp 不是预热目标。",
    "生成曲线只是初稿：请在 CC、FC、Drop 以及发展段检查点手动微调节点，而不是直接当成最终可用曲线。",
    "Fan preview 必须执行：用实际生豆和目标载量观察翻动，理想状态是四周均匀翻动、中间缓慢但仍有翻动。"
  ] : [
    "Nano 7 needs no preheat: load green coffee, fit the chaff collector, then start the roast; Start Temp is not a preheat target.",
    "Generated curves are drafts: manually adjust CC, FC, Drop and development checkpoints before treating the profile as roast-ready.",
    "Fan preview is required: use the actual beans and target load, then confirm even movement around the chamber with slower but visible movement in the center."
  ];

  const fanDrop = input.fan.startRpm - input.fan.descentRpm;
  const descentTime = input.fc.t - input.fan.descentOffsetSec;

  if (fanDrop < 200) {
    notes.push(zh
      ? "风速下降幅度很小：豆子脱水变轻后可能翻动过快，建议用 Fan preview 或降低后段风速确认。"
      : "Fan descent is very small: beans may move too fast after drying and losing mass; confirm with Fan preview or lower the late-stage fan speed."
    );
  }
  if (fanDrop > 1400 || input.fan.descentOffsetSec > 45) {
    notes.push(zh
      ? "风速下降偏激进：若翻动不足，可能导致受热不均或追温困难，请先提高后段风速或缩短下降提前量。"
      : "Fan descent is aggressive: weak bean movement can cause uneven heat transfer or poor profile tracking; raise late-stage fan speed or reduce the FC offset."
    );
  }
  if (descentTime < input.cc.t || descentTime > input.fc.t + 20) {
    notes.push(zh
      ? "风速下降点与烘焙进程关系异常：建议让风速下降围绕 FC 前后展开，避免前段排湿或后段追温出问题。"
      : "Fan descent timing is detached from the roast process: keep the descent around FC to avoid drying-stage exhaust issues or late-stage tracking problems."
    );
  }

  return notes;
}

// ---- Private helpers ----

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

function buildTemperatureAnchors(input: ProfileGeneratorInput) {
  const ccRamp = Math.round(input.cc.t * 0.35);
  const maillardMid = Math.round((input.cc.t + input.fc.t) / 2);

  return [
    // Anchor 0: Start
    {
      position: { timeSeconds: 0, value: input.startTemp },
      leftCtrl: { timeSeconds: 0, value: 0 },
      rightCtrl: { timeSeconds: Math.round(ccRamp * 0.3), value: round1(input.startTemp + 18) }
    },
    // Anchor 1: Mid-drying
    {
      position: { timeSeconds: Math.round(input.cc.t * 0.5), value: round1(input.startTemp + (input.cc.T - input.startTemp) * 0.54) },
      leftCtrl: { timeSeconds: Math.round(input.cc.t * 0.35), value: round1(input.startTemp + (input.cc.T - input.startTemp) * 0.42) },
      rightCtrl: { timeSeconds: Math.round(input.cc.t * 0.72), value: round1(input.startTemp + (input.cc.T - input.startTemp) * 0.68) }
    },
    // Anchor 2: CC point
    {
      position: { timeSeconds: input.cc.t, value: input.cc.T },
      leftCtrl: { timeSeconds: Math.round(input.cc.t - (input.cc.t - input.cc.t * 0.5) * 0.3), value: round1(input.cc.T - 4) },
      rightCtrl: { timeSeconds: Math.round(input.cc.t + (maillardMid - input.cc.t) * 0.3), value: round1(input.cc.T + 3) }
    },
    // Anchor 3: FC point
    {
      position: { timeSeconds: input.fc.t, value: input.fc.T },
      leftCtrl: { timeSeconds: Math.round(input.fc.t - (input.fc.t - maillardMid) * 0.25), value: round1(input.fc.T - 3) },
      rightCtrl: { timeSeconds: Math.round(input.fc.t + (input.drop.t - input.fc.t) * 0.25), value: round1(input.fc.T + 2) }
    },
    // Anchor 4: Drop
    {
      position: { timeSeconds: input.drop.t, value: input.drop.T },
      leftCtrl: { timeSeconds: Math.round(input.fc.t + (input.drop.t - input.fc.t) * 0.72), value: round1(input.drop.T - 1.5) },
      rightCtrl: { timeSeconds: input.drop.t, value: 0 }
    }
  ];
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

function enforceMonotonic(points: CurvePoint[]): CurvePoint[] {
  let last = -Infinity;
  return points.map((p) => {
    const value = Math.max(p.value, last);
    last = value;
    return { ...p, value: round1(value) };
  });
}

function enforceMilestones(points: CurvePoint[], input: ProfileGeneratorInput): CurvePoint[] {
  const milestones = new Map<number, number>([
    [0, round1(input.startTemp)],
    [input.cc.t, round1(input.cc.T)],
    [input.fc.t, round1(input.fc.T)],
    [input.drop.t, round1(input.drop.T)]
  ]);
  const merged = new Map(points.map((p) => [p.timeSeconds, p.value]));
  for (const [t, v] of milestones) merged.set(t, v);
  return [...merged.entries()]
    .map(([timeSeconds, value]) => ({ timeSeconds, value }))
    .sort((a, b) => a.timeSeconds - b.timeSeconds);
}

function buildAdjustmentNodes(input: ProfileGeneratorInput, points: CurvePoint[]) {
  const nodes = [
    { label: "Start", t: 0 },
    { label: "Drying adjust", t: Math.max(30, Math.round(input.cc.t * 0.5)) },
    { label: "CC", t: input.cc.t },
    { label: "Maillard adjust", t: Math.round((input.cc.t + input.fc.t) / 2) },
    { label: "FC", t: input.fc.t },
    { label: "Develop adjust", t: Math.min(input.drop.t - 1, input.fc.t + Math.round((input.drop.t - input.fc.t) * 0.45)) },
    { label: "Drop", t: input.drop.t }
  ];
  return nodes.map((n) => ({ label: n.label, timeSeconds: n.t, temperatureC: round1(lookupTemp(points, n.t)) }));
}

function lookupTemp(points: CurvePoint[], timeSeconds: number): number {
  for (let i = 1; i < points.length; i += 1) {
    if (points[i].timeSeconds >= timeSeconds) {
      const d = points[i].timeSeconds - points[i - 1].timeSeconds;
      const r = d > 0 ? (timeSeconds - points[i - 1].timeSeconds) / d : 0;
      return points[i - 1].value + (points[i].value - points[i - 1].value) * r;
    }
  }
  return points.at(-1)?.value ?? 0;
}

function adjustedRoastLevels(dropTemp: number): number[] {
  const levels = [...DEFAULT_ROAST_LEVELS];
  if (dropTemp <= levels[0]) levels[0] = round1(dropTemp - 2);
  if (dropTemp >= levels[levels.length - 1]) levels[levels.length - 1] = round1(dropTemp + 2);
  return levels;
}

function dropTempToRecommendedLevel(dropTemp: number, levels: number[]): number {
  if (dropTemp <= levels[0]) return 0;
  for (let i = 0; i < levels.length - 1; i += 1) {
    if (dropTemp <= levels[i + 1]) {
      return round3(i + (dropTemp - levels[i]) / Math.max(levels[i + 1] - levels[i], 0.1));
    }
  }
  return levels.length - 1;
}

function estimateRorDecline(points: CurvePoint[], interval: { startSec: number; endSec: number }): number {
  const start = estimateRorAt(points, interval.startSec);
  const end = estimateRorAt(points, interval.endSec);
  return start - end;
}

function estimateRorAt(points: CurvePoint[], timeSeconds: number): number {
  const before = lookupTemp(points, Math.max(0, timeSeconds - 15));
  const after = lookupTemp(points, Math.min(points.at(-1)?.timeSeconds ?? timeSeconds, timeSeconds + 15));
  return ((after - before) / 30) * 60;
}

function formatSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60);
  return `${m}:${Math.round(seconds % 60).toString().padStart(2, "0")}`;
}

function sanitizeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9一-龥_-]+/g, "_").replace(/^_+|_+$/g, "") || "generated-profile";
}
