import type { RoastLogAnalysis } from "@/lib/types";

export function createNeedsReviewAnalysis(reason: string): RoastLogAnalysis {
  return {
    summary: `已保存图片，但需要人工确认关键读数：${reason}`,
    confidence: 0.25,
    needsReview: true,
    legends: [],
    keyMetrics: {},
    curveAssessment: ["未启用或未完成视觉解析，当前不能可靠判断跟线、ROR 或发展段表现。"],
    riskNotes: ["请确认一爆、结束点、发展时间、失重率等字段后再将案例作为高置信参考。"],
    nextRoastSuggestions: ["先补充 FC、End、Dev、入豆/出豆重量，再生成下一锅调整建议。"],
    extractedText: null,
    model: null
  };
}

export function normalizeAnalysis(input: unknown): RoastLogAnalysis {
  const value = typeof input === "object" && input !== null ? (input as Partial<RoastLogAnalysis>) : {};
  const confidence = clampNumber(value.confidence, 0, 1, 0.35);

  return {
    summary: stringOrDefault(value.summary, "图片已解析，但摘要需要人工确认。"),
    confidence,
    needsReview: typeof value.needsReview === "boolean" ? value.needsReview : confidence < 0.72,
    legends: arrayOfStrings(value.legends),
    keyMetrics: typeof value.keyMetrics === "object" && value.keyMetrics !== null ? value.keyMetrics : {},
    curveAssessment: arrayOfStrings(value.curveAssessment),
    riskNotes: arrayOfStrings(value.riskNotes),
    nextRoastSuggestions: arrayOfStrings(value.nextRoastSuggestions),
    extractedText: typeof value.extractedText === "string" ? value.extractedText : null,
    model: typeof value.model === "string" ? value.model : null
  };
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function stringOrDefault(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}
