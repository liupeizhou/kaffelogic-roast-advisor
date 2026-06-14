export type UploadFileKind = "kpro" | "log_image" | "unknown";
export type ParseStatus = "parsed" | "needs_review" | "failed";

export type CurvePoint = {
  timeSeconds: number;
  value: number;
};

export type KproProfile = {
  fileName: string;
  shortName: string | null;
  designer: string | null;
  description: string | null;
  schemaVersion: string | null;
  recommendedLevel: number | null;
  expectedFirstCrackTemp: number | null;
  expectedColourChangeTemp: number | null;
  roastLevels: number[];
  roastCurvePoints: CurvePoint[];
  fanCurvePoints: CurvePoint[];
  rawFields: Record<string, string>;
};

export type RoastMetric = {
  time?: string | null;
  temperatureC?: number | null;
};

export type RoastLogKeyMetrics = {
  profileName?: string | null;
  expectedFirstCrack?: RoastMetric | null;
  firstCrack?: RoastMetric | null;
  roastEnd?: RoastMetric | null;
  developmentTime?: string | null;
  developmentRatioPercent?: number | null;
  developmentRiseC?: number | null;
  inputWeightG?: number | null;
  outputWeightG?: number | null;
  weightLossPercent?: number | null;
  manualEnd?: boolean | null;
};

export type RoastLogAnalysis = {
  summary: string;
  confidence: number;
  needsReview: boolean;
  legends: string[];
  keyMetrics: RoastLogKeyMetrics;
  curveAssessment: string[];
  riskNotes: string[];
  nextRoastSuggestions: string[];
  extractedText?: string | null;
  model?: string | null;
};

export type UploadAnalysisResult = {
  uploadId: string | null;
  hash: string;
  fileName: string;
  fileKind: UploadFileKind;
  mimeType: string;
  size: number;
  status: ParseStatus;
  duplicate: boolean;
  storagePath: string | null;
  persisted: boolean;
  profile?: KproProfile;
  logAnalysis?: RoastLogAnalysis;
  quotaSnapshot?: import("@/lib/quota").QuotaSnapshot;
  error?: string;
};

export type UploadRecord = {
  id: string;
  owner_id?: string | null;
  file_name: string;
  file_hash: string;
  file_kind: UploadFileKind;
  mime_type: string;
  storage_path: string | null;
  size_bytes: number;
  parse_status: ParseStatus;
  visibility?: "private" | "public" | "unlisted";
  source_scope?: "user" | "official" | "community" | "system";
};
