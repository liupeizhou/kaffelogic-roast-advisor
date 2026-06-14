import type { CurvePoint } from "@/lib/types";

export type OfficialProfileFamily = {
  key: string;
  name: string;
  intentZh: string;
  intentEn: string;
  bestForZh: string[];
  bestForEn: string[];
  cautionZh: string;
  cautionEn: string;
  keywords: string[];
};

export type RoastPhaseMetric = {
  key: "drying" | "maillard" | "development";
  labelZh: string;
  labelEn: string;
  startSeconds: number;
  endSeconds: number;
  ratio: number | null;
};

export type OfficialProfileInsight = {
  family: OfficialProfileFamily | null;
  colourChangeSeconds: number | null;
  firstCrackSeconds: number | null;
  developmentRatio: number | null;
  phaseMetrics: RoastPhaseMetric[];
  levelAdviceZh: string;
  levelAdviceEn: string;
  profileAdviceZh: string;
  profileAdviceEn: string;
};

export const officialProfileFamilies: OfficialProfileFamily[] = [
  {
    key: "kl-classic",
    name: "KL Classic",
    intentZh: "默认排障与日常中深烘起点。",
    intentEn: "Default troubleshooting profile and everyday medium-to-dark starting point.",
    bestForZh: ["新豆首烘基准", "中度到中深烘", "需要稳定参照时"],
    bestForEn: ["First baseline roast", "Medium to medium-dark roasts", "When a stable reference is needed"],
    cautionZh: "如果风味方向不对，优先换 profile；如果只是偏浅或偏深，先微调 level。",
    cautionEn: "If the flavor direction is wrong, switch profile first; if it is only light or dark, adjust level.",
    keywords: ["classic", "default"]
  },
  {
    key: "kl-explorer",
    name: "KL Explorer",
    intentZh: "从 KL Classic 延伸出的探索型起点，用来比较烘焙风格差异。",
    intentEn: "A modified KL Classic starting point for comparing roast styles.",
    bestForZh: ["学习曲线差异", "想尝试不同风格", "同一支豆对比实验"],
    bestForEn: ["Learning profile differences", "Trying another roast style", "Same-bean comparison"],
    cautionZh: "适合作为对照组，不宜直接当成所有豆子的最终答案。",
    cautionEn: "Best used as a comparison, not as the final answer for every coffee.",
    keywords: ["explorer"]
  },
  {
    key: "washed-natural",
    name: "KL Washed / KL Natural",
    intentZh: "按处理法聚焦的起点，水洗与日晒应分开判断。",
    intentEn: "Processing-method specific starting points for washed and natural coffees.",
    bestForZh: ["水洗豆", "日晒豆", "处理法影响明显的批次"],
    bestForEn: ["Washed coffees", "Natural coffees", "Lots where processing method strongly shapes flavor"],
    cautionZh: "请优先看 .kpro 的 About/description；处理法匹配比单纯 level 更关键。",
    cautionEn: "Read the .kpro About/description first; process fit matters more than level alone.",
    keywords: ["washed", "natural"]
  },
  {
    key: "rtd",
    name: "RTD Profiles",
    intentZh: "Ready to Drink：烘后立即研磨冲煮，风味通常服务于接下来 2-3 天。",
    intentEn: "Ready to Drink profiles for brewing immediately after roasting, typically useful for the next 2-3 days.",
    bestForZh: ["临时缺豆", "活动现场", "不计划长时间养豆"],
    bestForEn: ["Running out of roasted coffee", "Events", "No long rest planned"],
    cautionZh: "不要用 RTD 的即时表现直接推断 REST 曲线的最佳峰值。",
    cautionEn: "Do not judge a REST-style peak solely from immediate RTD performance.",
    keywords: ["rtd", "ready"]
  },
  {
    key: "rest",
    name: "REST Profiles",
    intentZh: "为 3-5 天密封养豆后的最大风味表现设计。",
    intentEn: "Designed for peak flavor after 3-5 days of resting in airtight containers.",
    bestForZh: ["有计划备豆", "追求香气峰值", "杯测或日常精品冲煮"],
    bestForEn: ["Planned roasting", "Peak aroma expression", "Cupping or specialty brewing"],
    cautionZh: "当天喝到的风味可能不是最终表现，诊断时要记录养豆天数。",
    cautionEn: "Same-day flavor may not be the final expression; log rest days when diagnosing.",
    keywords: ["rest"]
  },
  {
    key: "cupping",
    name: "Cupping",
    intentZh: "为浸泡杯测与缺陷识别提供基础原产地表达。",
    intentEn: "A cupping baseline for immersion tasting, defect assessment and origin expression.",
    bestForZh: ["样品评估", "缺陷判断", "建立豆子基础风味坐标"],
    bestForEn: ["Sample evaluation", "Defect screening", "Building an origin baseline"],
    cautionZh: "杯测曲线不是所有冲煮目标的最终曲线，后续还要按萃取方式调整。",
    cautionEn: "A cupping profile is not the final answer for every brew method; adjust after evaluation.",
    keywords: ["cupping", "cup"]
  },
  {
    key: "decaf",
    name: "Decaf",
    intentZh: "为低因咖啡的表达设计。",
    intentEn: "Designed to express decaf coffees cleanly.",
    bestForZh: ["低因豆", "颜色变化较快的处理批次"],
    bestForEn: ["Decaf coffees", "Lots with faster apparent color change"],
    cautionZh: "低因豆颜色与热反应常不同，避免只按外观追深。",
    cautionEn: "Decaf color and heat response can differ; avoid chasing darkness by appearance alone.",
    keywords: ["decaf"]
  },
  {
    key: "robusta",
    name: "Robusta",
    intentZh: "为罗布斯塔咖啡开发。",
    intentEn: "Developed for roasting robusta coffees.",
    bestForZh: ["罗布斯塔", "拼配中的高 body 组分"],
    bestForEn: ["Robusta", "High-body blend components"],
    cautionZh: "不要把阿拉比卡酸质目标套到 Robusta 曲线上。",
    cautionEn: "Do not evaluate robusta profiles with arabica acidity expectations.",
    keywords: ["robusta"]
  },
  {
    key: "super-dark",
    name: "Super Dark",
    intentZh: "面向低酸、高 body、烟熏和强烈深烘取向。",
    intentEn: "For very dark, low-acidity, high-body and smoky intensity targets.",
    bestForZh: ["深烘意式", "低酸高醇厚", "烟熏强度目标"],
    bestForEn: ["Dark espresso", "Low acidity and high body", "Smoky intensity"],
    cautionZh: "发展过快会带烟熏/焦苦风险，短发展又可能欠发育。",
    cautionEn: "Rapid development can become smoky or bitter, while too short can underdevelop.",
    keywords: ["super dark", "dark"]
  }
];

export const officialPhaseNotes = [
  {
    key: "drying",
    titleZh: "Drying 干燥",
    titleEn: "Drying",
    textZh: "生豆通常约 8-12% 含水率，进入风味发展前需要完成有效干燥。",
    textEn: "Green coffee is typically around 8-12% moisture and needs drying before flavor development starts."
  },
  {
    key: "maillard",
    titleZh: "Colour Change / Maillard",
    titleEn: "Colour Change / Maillard",
    textZh: "转黄/转褐标志 Maillard 起点，糖与氨基酸反应开始塑造香气和颜色。",
    textEn: "Color change marks the Maillard start, where sugars and amino acids begin shaping aroma and color."
  },
  {
    key: "first-crack",
    titleZh: "First Crack / Development",
    titleEn: "First Crack / Development",
    textZh: "一爆开启发展段；过快发展易烟熏，过短发展易欠发育。",
    textEn: "First crack starts development; very rapid development risks smoky flavors, very short development risks underdevelopment."
  }
] as const;

export function getOfficialProfileInsight(input: {
  name?: string | null;
  description?: string | null;
  processFit?: string | null;
  expectedColourChangeTemp?: number | null;
  expectedFirstCrackTemp?: number | null;
  roastCurvePoints?: CurvePoint[] | null;
}): OfficialProfileInsight {
  const source = `${input.name ?? ""} ${input.description ?? ""} ${input.processFit ?? ""}`.toLowerCase();
  const family = officialProfileFamilies.find((candidate) =>
    candidate.keywords.some((keyword) => source.includes(keyword))
  ) ?? null;
  const points = (input.roastCurvePoints ?? []).slice().sort((a, b) => a.timeSeconds - b.timeSeconds);
  const endSeconds = points.at(-1)?.timeSeconds ?? 0;
  const colourChangeSeconds = crossingTime(points, input.expectedColourChangeTemp ?? null);
  const firstCrackSeconds = crossingTime(points, input.expectedFirstCrackTemp ?? null);
  const phaseMetrics = buildPhaseMetrics(endSeconds, colourChangeSeconds, firstCrackSeconds);
  const developmentRatio = endSeconds && firstCrackSeconds !== null
    ? ((endSeconds - firstCrackSeconds) / endSeconds) * 100
    : null;

  return {
    family,
    colourChangeSeconds,
    firstCrackSeconds,
    developmentRatio,
    phaseMetrics,
    levelAdviceZh: "风味方向正确但偏浅/偏深时，优先用 level 调整结束温度；不要为了修正处理法不匹配而只推 level。",
    levelAdviceEn: "When the style is right but the roast is light or dark, use level to adjust end temperature; do not use level alone to fix a mismatched process profile.",
    profileAdviceZh: "如果酸质、甜感、body 或干净度方向明显不对，先换核心 profile，再考虑编辑 bean curve / fan curve。",
    profileAdviceEn: "If acidity, sweetness, body or cleanliness are directionally wrong, switch core profile before editing bean or fan curves."
  };
}

export function formatRoastTime(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) return "N/A";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

function buildPhaseMetrics(endSeconds: number, colourChangeSeconds: number | null, firstCrackSeconds: number | null): RoastPhaseMetric[] {
  if (!endSeconds) return [];
  const colour = colourChangeSeconds ?? Math.round(endSeconds * 0.42);
  const fc = firstCrackSeconds ?? Math.round(endSeconds * 0.78);
  return [
    {
      key: "drying",
      labelZh: "干燥",
      labelEn: "Drying",
      startSeconds: 0,
      endSeconds: Math.min(colour, endSeconds),
      ratio: Math.min(colour, endSeconds) / endSeconds * 100
    },
    {
      key: "maillard",
      labelZh: "Maillard",
      labelEn: "Maillard",
      startSeconds: Math.min(colour, endSeconds),
      endSeconds: Math.min(fc, endSeconds),
      ratio: Math.max(Math.min(fc, endSeconds) - Math.min(colour, endSeconds), 0) / endSeconds * 100
    },
    {
      key: "development",
      labelZh: "发展",
      labelEn: "Development",
      startSeconds: Math.min(fc, endSeconds),
      endSeconds,
      ratio: Math.max(endSeconds - Math.min(fc, endSeconds), 0) / endSeconds * 100
    }
  ];
}

function crossingTime(points: CurvePoint[], target: number | null) {
  if (!target || points.length < 2) return null;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (previous.value === target) return previous.timeSeconds;
    if ((previous.value <= target && current.value >= target) || (previous.value >= target && current.value <= target)) {
      const valueSpan = current.value - previous.value;
      if (!valueSpan) return current.timeSeconds;
      const ratio = (target - previous.value) / valueSpan;
      return Math.round(previous.timeSeconds + ratio * (current.timeSeconds - previous.timeSeconds));
    }
  }
  return null;
}
