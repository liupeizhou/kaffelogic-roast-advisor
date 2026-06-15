import { parseCurvePoints, parseNumberList, parseOptionalNumber } from "@/lib/kpro";
import type { KlogParseResult, KlogSample, RoastLogAnalysis } from "@/lib/types";

const TABLE_HEADER_PREFIX = "time\t";

export function detectKlog(fileName: string, text: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.endsWith(".klog") || (text.includes("log_file_name:") && text.includes(TABLE_HEADER_PREFIX));
}

export function parseKlog(text: string, fileName = "uploaded.klog"): KlogParseResult {
  const lines = text.split(/\r?\n/);
  const tableHeaderIndex = lines.findIndex((line) => line.startsWith(TABLE_HEADER_PREFIX));
  const fields = parseHeaderFields(tableHeaderIndex >= 0 ? lines.slice(0, tableHeaderIndex) : lines);
  const samples = tableHeaderIndex >= 0 ? parseSamples(lines.slice(tableHeaderIndex)) : [];
  const metrics = calculateMetrics(fields, samples);

  return {
    fileName,
    metadata: {
      logFileName: fields.log_file_name ?? null,
      profileFileName: fields.profile_file_name ?? null,
      profileShortName: fields.profile_short_name ?? null,
      profileDesigner: fields.profile_designer ?? null,
      roastDate: fields.roast_date ?? null,
      roastingLevel: parseOptionalNumber(fields.roasting_level),
      recommendedLevel: parseOptionalNumber(fields.recommended_level),
      expectedFirstCrackTemp: parseOptionalNumber(fields.expect_fc),
      expectedColourChangeTemp: parseOptionalNumber(fields.expect_colrchange),
      ambientTemperatureC: parseOptionalNumber(fields.ambient_temperature),
      referenceLoadSizeG: parseOptionalNumber(fields.reference_load_size),
      boostLoadSizeG: parseOptionalNumber(fields.boost_load_size),
      deviceModel: fields.model ?? null,
      firmwareVersion: fields.firmware_version ?? null
    },
    targetProfile: {
      roastLevels: parseNumberList(fields.roast_levels),
      roastCurvePoints: parseCurvePoints(fields.roast_profile, "temperature"),
      fanCurvePoints: parseCurvePoints(fields.fan_profile, "fan")
    },
    samples,
    metrics,
    rawFields: fields
  };
}

export function analyzeKlog(parsed: KlogParseResult): RoastLogAnalysis {
  const metrics = parsed.metrics;
  const profileName = parsed.metadata.profileShortName ?? parsed.metadata.profileFileName ?? "未知 profile";
  const tracking = metrics.avgAbsTrackingErrorC === null
    ? "无法计算跟线误差。"
    : `平均跟线误差 ${metrics.avgAbsTrackingErrorC.toFixed(1)}°C，最大误差 ${metrics.maxAbsTrackingErrorC?.toFixed(1) ?? "-"}°C。`;
  const rorRisk = assessRorRisk(parsed);
  const needsReview = !metrics.roastEndTimeSeconds || metrics.avgAbsTrackingErrorC === null;
  const developmentRatio = metrics.developmentRatioPercent;
  const fcTime = metrics.firstCrackTimeSeconds;
  const summary = needsReview
    ? `${profileName} 的 .klog 已解析，但缺少足够关键节点，需要人工确认结束点或 FC。`
    : `${profileName} 实际结束约 ${formatSeconds(metrics.roastEndTimeSeconds)} / ${formatTemp(metrics.roastEndTemperatureC)}，${tracking}`;

  return {
    summary,
    confidence: needsReview ? 0.68 : 0.92,
    needsReview,
    legends: [
      "mean temp",
      "profile",
      "profile ROR",
      "actual ROR",
      "power",
      "actual fan RPM"
    ],
    keyMetrics: {
      profileName,
      expectedFirstCrack: parsed.metadata.expectedFirstCrackTemp
        ? { time: fcTime ? formatSeconds(fcTime) : null, temperatureC: parsed.metadata.expectedFirstCrackTemp }
        : null,
      firstCrack: fcTime ? { time: formatSeconds(fcTime), temperatureC: parsed.metadata.expectedFirstCrackTemp } : null,
      roastEnd: metrics.roastEndTimeSeconds
        ? { time: formatSeconds(metrics.roastEndTimeSeconds), temperatureC: metrics.roastEndTemperatureC }
        : null,
      developmentTime: metrics.developmentTimeSeconds ? formatSeconds(metrics.developmentTimeSeconds) : null,
      developmentRatioPercent: developmentRatio === null ? null : round(developmentRatio, 1),
      developmentRiseC: metrics.developmentRiseC === null ? null : round(metrics.developmentRiseC, 1),
      manualEnd: metrics.coolingStartTimeSeconds !== null
    },
    curveAssessment: [
      `采样点 ${parsed.samples.length} 个；冷却开始 ${metrics.coolingStartTimeSeconds ? formatSeconds(metrics.coolingStartTimeSeconds) : "未识别"}。`,
      tracking,
      `最高 mean temp ${formatTemp(metrics.maxMeanTempC)}；峰值功率 ${metrics.maxPowerKw === null ? "N/A" : `${metrics.maxPowerKw.toFixed(2)} kW`}。`,
      rorRisk.assessment
    ],
    riskNotes: rorRisk.risks,
    nextRoastSuggestions: buildSuggestions(parsed, rorRisk.risks),
    extractedText: JSON.stringify({
      source: "klog",
      roastDate: parsed.metadata.roastDate,
      deviceModel: parsed.metadata.deviceModel,
      firmwareVersion: parsed.metadata.firmwareVersion,
      metrics
    }),
    model: "deterministic-klog-parser"
  };
}

function parseHeaderFields(lines: string[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of lines) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key) fields[key] = value;
  }
  return fields;
}

function parseSamples(lines: string[]): KlogSample[] {
  const header = lines[0]?.split("\t").map(normalizeColumn) ?? [];
  const samples: KlogSample[] = [];

  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const values = line.split("\t");
    const row: Record<string, number | null> = {};
    header.forEach((column, index) => {
      row[column] = parseTableNumber(values[index]);
    });
    const timeSeconds = row.time;
    if (typeof timeSeconds !== "number") continue;
    samples.push({
      timeSeconds,
      spotTempC: row.spot_temp,
      tempC: row.temp,
      meanTempC: row.mean_temp,
      profileTempC: row.profile,
      profileRor: row.profile_ror,
      actualRor: row.actual_ror,
      desiredRor: row.desired_ror,
      powerKw: row.power_kw,
      fanRpm: row.actual_fan_rpm
    });
  }

  return samples.sort((a, b) => a.timeSeconds - b.timeSeconds);
}

function calculateMetrics(fields: Record<string, string>, samples: KlogSample[]): KlogParseResult["metrics"] {
  const roastEnd = findRoastEnd(samples);
  const roastRows = roastEnd ? samples.filter((sample) => sample.timeSeconds <= roastEnd.timeSeconds) : samples;
  const trackingErrors = roastRows
    .map((sample) => isFiniteNumber(sample.meanTempC) && isFiniteNumber(sample.profileTempC) ? sample.meanTempC - sample.profileTempC : null)
    .filter((value): value is number => value !== null);
  const firstCrackTemp = parseOptionalNumber(fields.expect_fc);
  const colourChangeTemp = parseOptionalNumber(fields.expect_colrchange);
  const firstCrackTime = firstCrackTemp && firstCrackTemp > 0 ? crossingTime(roastRows, firstCrackTemp) : null;
  const colourChangeTime = colourChangeTemp && colourChangeTemp > 0 ? crossingTime(roastRows, colourChangeTemp) : null;
  const endTemp = roastEnd?.meanTempC ?? maxBy(roastRows, (sample) => sample.meanTempC)?.meanTempC ?? null;
  const fcTempAtCrossing = firstCrackTime ? firstCrackTemp : null;
  const developmentTimeSeconds = roastEnd && firstCrackTime ? roastEnd.timeSeconds - firstCrackTime : null;
  const totalDuration = roastEnd?.timeSeconds ?? samples.at(-1)?.timeSeconds ?? null;

  return {
    sampleCount: samples.length,
    roastEndTimeSeconds: roastEnd?.timeSeconds ?? null,
    roastEndTemperatureC: endTemp,
    coolingStartTimeSeconds: roastEnd?.timeSeconds ?? null,
    maxMeanTempC: maxBy(roastRows, (sample) => sample.meanTempC)?.meanTempC ?? null,
    maxPowerKw: maxBy(roastRows, (sample) => sample.powerKw)?.powerKw ?? null,
    avgAbsTrackingErrorC: trackingErrors.length ? average(trackingErrors.map(Math.abs)) : null,
    maxAbsTrackingErrorC: trackingErrors.length ? Math.max(...trackingErrors.map(Math.abs)) : null,
    firstCrackTimeSeconds: firstCrackTime,
    colourChangeTimeSeconds: colourChangeTime,
    developmentTimeSeconds,
    developmentRatioPercent: totalDuration && developmentTimeSeconds ? (developmentTimeSeconds / totalDuration) * 100 : null,
    developmentRiseC: endTemp !== null && fcTempAtCrossing !== null ? endTemp - fcTempAtCrossing : null
  };
}

function assessRorRisk(parsed: KlogParseResult) {
  const end = parsed.metrics.roastEndTimeSeconds ?? parsed.samples.at(-1)?.timeSeconds ?? 0;
  const roastRows = parsed.samples.filter((sample) => sample.timeSeconds > 60 && sample.timeSeconds <= end);
  const finalWindow = roastRows.filter((sample) => sample.timeSeconds >= Math.max(0, end - 75));
  const rors = finalWindow.map((sample) => sample.actualRor).filter((value): value is number => typeof value === "number");
  const risks: string[] = [];
  const minRor = rors.length ? Math.min(...rors) : null;
  const maxRor = rors.length ? Math.max(...rors) : null;
  const early = rors.slice(0, Math.max(1, Math.floor(rors.length / 3)));
  const late = rors.slice(Math.max(0, rors.length - early.length));
  const flick = early.length && late.length ? average(late) - average(early) : 0;

  if (minRor !== null && minRor < -1) risks.push("发展末段或结束前 ROR 出现明显 crash，可能带来空洞、尖酸或熟度不均。");
  if (flick > 1.2 || (maxRor !== null && minRor !== null && maxRor - minRor > 3.5)) risks.push("末段 ROR 有 flick 风险，可能增加焦苦、烟感或干涩。");
  if (parsed.metrics.maxAbsTrackingErrorC !== null && parsed.metrics.maxAbsTrackingErrorC > 6) risks.push("最大跟线误差超过 6°C，建议检查入豆量、风扇、预热和环境温度。");
  if (parsed.metrics.avgAbsTrackingErrorC !== null && parsed.metrics.avgAbsTrackingErrorC <= 2.5) risks.push("整体跟线较稳，下一锅可优先围绕 level 或结束点微调。");

  return {
    assessment: minRor === null ? "ROR 数据不足，无法判断 crash/flick。" : `结束前 ROR 范围 ${minRor.toFixed(1)} 到 ${maxRor?.toFixed(1)} °C/min。`,
    risks: risks.length ? risks : ["未发现明显 ROR crash/flick；仍需结合杯测和失重确认。"]
  };
}

function buildSuggestions(parsed: KlogParseResult, risks: string[]) {
  const suggestions = [
    "把 `.klog` 作为主诊断依据：它比截图更适合计算跟线、ROR、power 和冷却开始点。",
    "下一锅记录入豆/出豆重量和杯测反馈，才能把这条实际曲线沉淀为高置信案例。"
  ];
  if (parsed.metrics.avgAbsTrackingErrorC !== null && parsed.metrics.avgAbsTrackingErrorC > 3) {
    suggestions.push("如果杯测偏空或发展不均，先检查入豆量、预热状态和风速曲线，再考虑改 profile。");
  }
  if (risks.some((risk) => risk.includes("flick"))) {
    suggestions.push("若杯中焦苦或干涩，下一锅尝试略早结束或降低发展末段热量。");
  }
  if (risks.some((risk) => risk.includes("crash"))) {
    suggestions.push("若杯中酸尖或空洞，下一锅避免一爆后热量掉得过快。");
  }
  return suggestions;
}

function findRoastEnd(samples: KlogSample[]) {
  for (let index = 1; index < samples.length; index += 1) {
    const current = samples[index];
    const previous = samples[index - 1];
    if (
      current.timeSeconds > 60
      && typeof current.powerKw === "number"
      && current.powerKw <= 0.01
      && typeof previous.powerKw === "number"
      && previous.powerKw > 0.05
    ) {
      return current;
    }
  }
  return maxBy(samples, (sample) => sample.meanTempC);
}

function crossingTime(samples: KlogSample[], target: number) {
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    const previousTemp = previous.meanTempC;
    const currentTemp = current.meanTempC;
    if (!isFiniteNumber(previousTemp) || !isFiniteNumber(currentTemp)) continue;
    if ((previousTemp <= target && currentTemp >= target) || (previousTemp >= target && currentTemp <= target)) {
      const span = currentTemp - previousTemp;
      if (!span) return current.timeSeconds;
      return previous.timeSeconds + ((target - previousTemp) / span) * (current.timeSeconds - previous.timeSeconds);
    }
  }
  return null;
}

function normalizeColumn(value: string) {
  return value
    .replace(/^[#=^]+/g, "")
    .replace(/[=#^]+/g, "")
    .toLowerCase()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .replace(/^temp$/, "temp")
    .replace(/^power_kw$/, "power_kw")
    .replace(/^actual_fan_rpm$/, "actual_fan_rpm");
}

function parseTableNumber(value: string | undefined) {
  if (value === undefined || !value.trim()) return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function maxBy<T>(items: T[], read: (item: T) => number | null | undefined): T | null {
  let best: T | null = null;
  let bestValue = -Infinity;
  for (const item of items) {
    const value = read(item);
    if (typeof value === "number" && Number.isFinite(value) && value > bestValue) {
      best = item;
      bestValue = value;
    }
  }
  return best;
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function formatSeconds(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) return null;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

function formatTemp(value: number | null) {
  return value === null ? "N/A" : `${value.toFixed(1)}°C`;
}
