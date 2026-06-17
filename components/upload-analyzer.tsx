"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileUp, History, Save, Star, UploadCloud } from "lucide-react";
import { Alert, Button, Card, Col, Descriptions, Divider, Empty, Image, Row, Select, Space, Statistic, Tag, Upload } from "antd";
import type { UploadProps } from "antd";
import CurveChart from "@/components/curve-chart";
import CurveRadarChart from "@/components/curve-radar-chart";
import { buildCurveRadarMetrics } from "@/lib/curve-radar";
import { getDictionary, type Locale } from "@/lib/i18n";
import type { CurveScoreResult } from "@/lib/curve-scoring";
import type { CurveDocumentRecord, RoastProfileRecord, UploadHistoryItem } from "@/lib/roast-persistence";
import type { KproProfile, RoastLogAnalysis, UploadAnalysisResult } from "@/lib/types";

type ReferenceOption = {
  label: string;
  options: Array<{ label: string; value: string }>;
};

export default function UploadAnalyzer({ locale = "zh" }: { locale?: Locale }) {
  const t = getDictionary(locale);
  const [files, setFiles] = useState<File[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<UploadAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [history, setHistory] = useState<UploadHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [referenceOptions, setReferenceOptions] = useState<ReferenceOption[]>([]);
  const [selectedReference, setSelectedReference] = useState<string | null>(null);
  const [compareUploadId, setCompareUploadId] = useState<string | null>(null);
  const [scoring, setScoring] = useState(false);
  const [scoreResult, setScoreResult] = useState<(CurveScoreResult & { id?: string; createdAt?: string }) | null>(null);

  const firstFile = files[0] ?? null;
  const isImage = useMemo(() => firstFile?.type.startsWith("image/") ?? false, [firstFile]);
  const compareItem = useMemo(() => history.find((item) => item.upload.id === compareUploadId) ?? null, [compareUploadId, history]);

  useEffect(() => {
    void loadHistory();
    void loadReferenceOptions();
  }, []);

  function onFilesChange(nextFiles: File[]) {
    setFiles(nextFiles);
    setResult(null);
    setError(null);
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      const nextImage = nextFiles.find((item) => item.type.startsWith("image/"));
      return nextImage ? URL.createObjectURL(nextImage) : null;
    });
  }

  const uploadProps: UploadProps = {
    accept: ".kpro,.klog,image/png,image/jpeg,image/webp,image/heic,image/heif",
    multiple: true,
    beforeUpload: (nextFile) => {
      setFiles((current) => [...current, nextFile]);
      return false;
    },
    onRemove: (file) => {
      setFiles((current) => current.filter((item) => item.name !== file.name));
      return true;
    }
  };

  async function analyze() {
    if (!files.length) return;
    setLoading(true);
    setError(null);
    let lastResult: UploadAnalysisResult | null = null;
    const errors: string[] = [];

    for (const file of files) {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/api/uploads/analyze", {
        method: "POST",
        body: formData
      });
      const payload = await response.json();
      if (!response.ok) {
        errors.push(`${file.name}: ${payload.error ?? "上传分析失败。"}`);
        continue;
      }
      lastResult = payload as UploadAnalysisResult;
    }
    setLoading(false);
    if (errors.length) setError(errors.join("；"));
    if (!lastResult) return;
    setResult(lastResult);
    setScoreResult(null);
    void loadHistory();
  }

  async function confirmAnalysis() {
    if (!result?.uploadId || !result.logAnalysis) return;
    setConfirming(true);
    const response = await fetch("/api/uploads/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uploadId: result.uploadId,
        confirmedAnalysis: { ...result.logAnalysis, needsReview: false },
        userCorrections: { confirmedFromUi: true }
      })
    });
    setConfirming(false);
    if (!response.ok) {
      const payload = await response.json();
      setError(payload.error ?? "保存确认结果失败。");
      return;
    }
    setResult({
      ...result,
      logAnalysis: { ...result.logAnalysis, needsReview: false },
      status: "parsed"
    });
    void loadHistory();
  }

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const response = await fetch("/api/uploads/history", { cache: "no-store" });
      const payload = await response.json() as { history?: UploadHistoryItem[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "读取上传历史失败。");
      setHistory(payload.history ?? []);
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : "读取上传历史失败。");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function loadReferenceOptions() {
    try {
      const [profilesResponse, curvesResponse] = await Promise.all([
        fetch("/api/library/profiles", { cache: "no-store" }),
        fetch("/api/curves", { cache: "no-store" })
      ]);
      const profilesPayload = await profilesResponse.json() as { profiles?: RoastProfileRecord[] };
      const curvesPayload = await curvesResponse.json() as { curves?: CurveDocumentRecord[] };
      const publicOptions = (profilesPayload.profiles ?? []).map((profile) => ({
        label: `${profile.display_name}${profile.source_scope === "user" ? " · 我的上传" : " · 公开库"}`,
        value: `public_profile:${profile.id}`
      }));
      const userOptions = (curvesPayload.curves ?? []).map((curve) => ({
        label: `${curve.title} · 我的编辑曲线`,
        value: `user_curve:${curve.id}`
      }));
      setReferenceOptions([
        { label: "公开/上传曲线库", options: publicOptions },
        { label: "我的曲线数据库", options: userOptions }
      ].filter((group) => group.options.length));
    } catch {
      setReferenceOptions([]);
    }
  }

  async function scoreUpload(uploadId: string | null) {
    if (!uploadId || !selectedReference) return;
    const [baselineKind, baselineId] = selectedReference.split(":");
    setScoring(true);
    setError(null);
    try {
      const response = await fetch(`/api/uploads/${uploadId}/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baselineKind, baselineId })
      });
      const payload = await response.json() as { score?: CurveScoreResult & { id?: string; createdAt?: string }; error?: string };
      if (!response.ok || !payload.score) throw new Error(payload.error ?? "评分失败。");
      setScoreResult(payload.score);
      void loadHistory();
    } catch (scoreError) {
      setError(scoreError instanceof Error ? scoreError.message : "评分失败。");
    } finally {
      setScoring(false);
    }
  }

  return (
    <Space orientation="vertical" size={16} className="full-width">
      <Card>
        <Space orientation="vertical" size={14} className="full-width">
          <Upload {...uploadProps}>
            <Button icon={<FileUp size={18} />}>{t.uploadPage.selectFile}</Button>
          </Upload>
          <Space size={12} wrap>
            <Button type="primary" icon={<UploadCloud size={18} />} disabled={!files.length} loading={loading} onClick={analyze}>
              {t.uploadPage.analyze}
            </Button>
            <span className="muted">{files.length ? `${files.length} 个文件 · ${Math.round(files.reduce((sum, file) => sum + file.size, 0) / 1024)} KB` : t.uploadPage.hint}</span>
            {files.length ? <Button onClick={() => onFilesChange([])}>清空队列</Button> : null}
          </Space>
          <span className="muted">{t.uploadPage.quotaHint}</span>
          {error ? <Alert type="error" showIcon message={error} /> : null}
        </Space>
      </Card>

      {previewUrl && isImage ? (
        <Card title="原始图片">
          <Image className="preview-image" src={previewUrl} alt="上传的 Kaffelogic log 图片预览" />
        </Card>
      ) : null}

      {result ? (
        <>
          <ScorePanel
            uploadId={result.uploadId}
            referenceOptions={referenceOptions}
            selectedReference={selectedReference}
            onReferenceChange={setSelectedReference}
            onScore={scoreUpload}
            scoring={scoring}
            score={scoreResult}
          />
          <UploadRadarCompare result={result} history={history} compareUploadId={compareUploadId} onCompareChange={setCompareUploadId} compareItem={compareItem} />
          <AnalysisResult result={result} onConfirm={confirmAnalysis} confirming={confirming} />
        </>
      ) : null}

      <UploadHistory
        loading={historyLoading}
        history={history}
        onRefresh={loadHistory}
        onOpen={(item) => {
          setResult(historyItemToResult(item));
          setScoreResult(item.latestScore);
          setError(null);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />
    </Space>
  );
}

function AnalysisResult({ result, onConfirm, confirming }: {
  result: UploadAnalysisResult;
  onConfirm: () => void;
  confirming: boolean;
}) {
  return (
    <Row gutter={[16, 16]} align="top">
      <Col xs={24} lg={16}>
        <Space orientation="vertical" size={16} className="full-width">
          <Card>
            <Space size={8} wrap>
              <Tag color="blue">{result.fileKind}</Tag>
              <Tag color={result.status === "failed" ? "red" : result.status === "needs_review" ? "orange" : "green"}>{result.status}</Tag>
              {result.duplicate ? <Tag color="orange">重复文件</Tag> : null}
              {result.persisted ? <Tag color="green" icon={<CheckCircle2 size={14} />}>已入库</Tag> : <Tag color="orange">本地预览</Tag>}
            </Space>
          </Card>
          {result.quotaSnapshot ? (
            <Row gutter={[12, 12]}>
              <Col xs={24} md={8}><Card><Statistic title="今日剩余" value={result.quotaSnapshot.dailyRemaining} /></Card></Col>
              <Col xs={24} md={8}><Card><Statistic title="本月剩余" value={result.quotaSnapshot.monthlyRemaining} /></Card></Col>
              <Col xs={24} md={8}><Card><Statistic title="按量余额" value={result.quotaSnapshot.creditBalance} /></Card></Col>
            </Row>
          ) : null}
          {result.profile ? <KproResult result={result} /> : null}
          {result.klog ? <KlogResult result={result} /> : null}
          {result.logAnalysis ? <LogResult analysis={result.logAnalysis} uploadId={result.uploadId} onConfirm={onConfirm} confirming={confirming} /> : null}
        </Space>
      </Col>

      <Col xs={24} lg={8}>
        <Card title="文件信息">
          <Descriptions column={1} size="small" items={[
            { key: "fileName", label: "文件名", children: result.fileName },
            { key: "hash", label: "SHA-256", children: `${result.hash.slice(0, 16)}...` },
            { key: "mime", label: "MIME", children: result.mimeType || "unknown" },
            { key: "size", label: "大小", children: `${Math.round(result.size / 1024)} KB` },
            { key: "storage", label: "Storage", children: result.storagePath ?? "未配置" }
          ]} />
        </Card>
      </Col>
    </Row>
  );
}

function UploadRadarCompare({
  result,
  history,
  compareUploadId,
  onCompareChange,
  compareItem
}: {
  result: UploadAnalysisResult;
  history: UploadHistoryItem[];
  compareUploadId: string | null;
  onCompareChange: (value: string | null) => void;
  compareItem: UploadHistoryItem | null;
}) {
  const currentCurve = getResultCurvePoints(result);
  const compareCurve = compareItem ? getResultCurvePoints(historyItemToResult(compareItem)) : null;
  if (!currentCurve) return null;
  const currentMetrics = buildCurveRadarMetrics(currentCurve.temp, currentCurve.fan);
  const compareMetrics = compareCurve ? buildCurveRadarMetrics(compareCurve.temp, compareCurve.fan) : null;

  return (
    <Card title="上传曲线雷达对比">
      <Space orientation="vertical" size={12} className="full-width">
        <Select
          allowClear
          showSearch
          placeholder="选择一条已上传曲线叠加对比"
          value={compareUploadId ?? undefined}
          onChange={(value) => onCompareChange(value ?? null)}
          options={history
            .filter((item) => item.upload.id !== result.uploadId && Boolean(getResultCurvePoints(historyItemToResult(item))))
            .map((item) => ({ value: item.upload.id, label: item.upload.file_name }))}
          optionFilterProp="label"
        />
        <CurveRadarChart
          locale="zh"
          series={[
            { name: result.fileName, color: "#f26735", metrics: currentMetrics },
            ...(compareMetrics && compareItem ? [{ name: compareItem.upload.file_name, color: "#2563eb", metrics: compareMetrics }] : [])
          ]}
        />
      </Space>
    </Card>
  );
}

function ScorePanel({
  uploadId,
  referenceOptions,
  selectedReference,
  onReferenceChange,
  onScore,
  scoring,
  score
}: {
  uploadId: string | null;
  referenceOptions: ReferenceOption[];
  selectedReference: string | null;
  onReferenceChange: (value: string | null) => void;
  onScore: (uploadId: string | null) => void;
  scoring: boolean;
  score: (CurveScoreResult & { id?: string; createdAt?: string }) | null;
}) {
  return (
    <Card title={<span className="card-title"><Star size={18} />曲线评分</span>}>
      <Space orientation="vertical" size={12} className="full-width">
        <span className="muted">先手动选择一条数据库曲线作为参考：可以选公开曲线库，也可以选你自己保存的曲线数据库。</span>
        <Space size={10} wrap className="full-width">
          <Select
            className="score-reference-select"
            allowClear
            showSearch
            placeholder="选择参考曲线"
            value={selectedReference ?? undefined}
            onChange={(value) => onReferenceChange(value ?? null)}
            options={referenceOptions}
            optionFilterProp="label"
          />
          <Button type="primary" icon={<Star size={16} />} disabled={!uploadId || !selectedReference} loading={scoring} onClick={() => onScore(uploadId)}>
            对比评分
          </Button>
        </Space>
        {!referenceOptions.length ? <Alert type="info" showIcon message="暂无可选参考曲线。请先在后台导入公开曲线，或在曲线编辑器保存一条个人曲线。" /> : null}
        {score ? (
          <Card size="small" className="score-result-card">
            <Row gutter={[12, 12]} align="middle">
              <Col xs={24} md={6}><Statistic title="评分" value={score.score} suffix="/ 100" /></Col>
              <Col xs={24} md={6}><Statistic title="评级" value={ratingLabel(score.rating)} /></Col>
              <Col xs={24} md={6}><Statistic title="平均温差" value={score.metrics.avgAbsDeltaC} suffix="C" /></Col>
              <Col xs={24} md={6}><Statistic title="最大温差" value={score.metrics.maxAbsDeltaC} suffix="C" /></Col>
            </Row>
            <ul className="compact-list">
              {score.notes.map((note) => <li key={note}>{note}</li>)}
            </ul>
          </Card>
        ) : null}
      </Space>
    </Card>
  );
}

function UploadHistory({
  history,
  loading,
  onRefresh,
  onOpen
}: {
  history: UploadHistoryItem[];
  loading: boolean;
  onRefresh: () => void;
  onOpen: (item: UploadHistoryItem) => void;
}) {
  return (
    <Card title={<span className="card-title"><History size={18} />上传历史</span>} extra={<Button size="small" onClick={onRefresh} loading={loading}>刷新</Button>}>
      {!history.length && !loading ? <Empty description="还没有上传历史" /> : null}
      {loading ? <p className="muted">加载中...</p> : null}
      <div className="upload-history-list" aria-busy={loading}>
        {history.map((item) => {
          const analysis = item.log?.confirmed_analysis ?? item.log?.ai_analysis ?? null;
          return (
            <div key={item.upload.id} className="upload-history-item">
              <div>
                <Space size={8} wrap>
                  <span>{item.upload.file_name}</span>
                  <Tag color="blue">{item.upload.file_kind}</Tag>
                  <Tag color={item.upload.parse_status === "parsed" ? "green" : item.upload.parse_status === "needs_review" ? "orange" : "red"}>{item.upload.parse_status}</Tag>
                  {item.latestScore ? <Tag color="gold">评分 {item.latestScore.score}</Tag> : null}
                </Space>
                <p className="muted">{analysis?.summary ?? item.profile?.description ?? `上传于 ${formatDate(item.upload.created_at)}`}</p>
              </div>
              <Button size="small" onClick={() => onOpen(item)}>查看</Button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function KlogResult({ result }: { result: UploadAnalysisResult }) {
  const klog = result.klog;
  if (!klog) return null;

  const downsampledMean = downsample(klog.samples, 180).map((sample) => ({
    timeSeconds: sample.timeSeconds,
    value: sample.meanTempC ?? 0
  })).filter((point) => point.value > 0);
  const downsampledProfile = downsample(klog.samples, 180).map((sample) => ({
    timeSeconds: sample.timeSeconds,
    value: sample.profileTempC ?? 0
  })).filter((point) => point.value > 0);
  const downsampledPower = downsample(klog.samples, 180).map((sample) => ({
    timeSeconds: sample.timeSeconds,
    value: sample.powerKw === null ? 0 : sample.powerKw * 100
  }));

  return (
    <>
      <Card title="KLOG 实际烘焙记录">
        <Descriptions column={1} bordered size="small" items={[
          { key: "profile", label: "使用 Profile", children: klog.metadata.profileShortName ?? klog.metadata.profileFileName ?? "未识别" },
          { key: "date", label: "烘焙时间", children: klog.metadata.roastDate ?? "未记录" },
          { key: "level", label: "实际 Level", children: klog.metadata.roastingLevel ?? "未记录" },
          { key: "device", label: "设备/固件", children: `${klog.metadata.deviceModel ?? "-"} / ${klog.metadata.firmwareVersion ?? "-"}` },
          { key: "samples", label: "采样点", children: klog.metrics.sampleCount },
          { key: "end", label: "结束点", children: `${formatSeconds(klog.metrics.roastEndTimeSeconds)} / ${formatNumber(klog.metrics.roastEndTemperatureC)}°C` },
          { key: "tracking", label: "跟线误差", children: `avg ${formatNumber(klog.metrics.avgAbsTrackingErrorC)}°C / max ${formatNumber(klog.metrics.maxAbsTrackingErrorC)}°C` }
        ]} />
      </Card>
      <Card title="实际曲线对比">
        <Space orientation="vertical" size={16} className="full-width">
          <CurveChart title="实际 mean temp" points={downsampledMean} color="#f26735" unit="°C" />
          <CurveChart title="目标 profile" points={downsampledProfile} color="#2563eb" unit="°C" />
          <CurveChart title="Power x100" points={downsampledPower} color="#176B42" />
        </Space>
      </Card>
    </>
  );
}

function KproResult({ result }: { result: UploadAnalysisResult }) {
  const profile = result.profile;
  if (!profile) return null;

  return (
    <>
      <Card title="KPRO 解析预览">
        <Descriptions column={1} bordered size="small" items={[
          { key: "name", label: "曲线名", children: profile.shortName ?? "未识别" },
          { key: "designer", label: "设计者", children: profile.designer ?? "未知" },
          { key: "level", label: "推荐 Level", children: profile.recommendedLevel ?? "未提供" },
          { key: "fc", label: "预计一爆", children: profile.expectedFirstCrackTemp ? `${profile.expectedFirstCrackTemp}°C` : "未提供" },
          { key: "levels", label: "烘焙度点", children: profile.roastLevels.length ? profile.roastLevels.join(", ") : "未提供" },
          { key: "desc", label: "说明", children: profile.description ?? "无说明" }
        ]} />
      </Card>
      <Card title="曲线图">
        <Space orientation="vertical" size={16} className="full-width">
          <CurveChart title="目标温度曲线" points={profile.roastCurvePoints} color="#2563eb" unit="°C" />
          <CurveChart title="风速曲线" points={profile.fanCurvePoints} color="#176B42" />
        </Space>
      </Card>
    </>
  );
}

function LogResult({ analysis, uploadId, onConfirm, confirming }: {
  analysis: RoastLogAnalysis;
  uploadId: string | null;
  onConfirm: () => void;
  confirming: boolean;
}) {
  return (
    <Card
      title="Log 诊断"
      extra={
        <Button icon={<Save size={18} />} disabled={!uploadId || confirming || !analysis.needsReview} loading={confirming} onClick={onConfirm}>
          确认结果
        </Button>
      }
    >
      <Space orientation="vertical" size={16} className="full-width">
        <Space size={8} wrap>
          <Tag color={analysis.needsReview ? "orange" : "green"}>{analysis.needsReview ? "需要人工确认" : "已确认"}</Tag>
          <Tag>置信度 {Math.round(analysis.confidence * 100)}%</Tag>
          {analysis.model ? <Tag>{analysis.model}</Tag> : null}
        </Space>
        <Alert type={analysis.needsReview ? "warning" : "success"} showIcon message={analysis.summary} />
        <Descriptions column={1} bordered size="small" title="关键读数" items={[
          { key: "profile", label: "Profile", children: analysis.keyMetrics.profileName ?? "未识别" },
          { key: "fc", label: "FC", children: formatMetric(analysis.keyMetrics.firstCrack) },
          { key: "expectedFc", label: "Expected FC", children: formatMetric(analysis.keyMetrics.expectedFirstCrack) },
          { key: "end", label: "End", children: formatMetric(analysis.keyMetrics.roastEnd) },
          { key: "dev", label: "发展", children: `${analysis.keyMetrics.developmentTime ?? "-"} / ${analysis.keyMetrics.developmentRatioPercent ?? "-"}% / +${analysis.keyMetrics.developmentRiseC ?? "-"}°C` },
          { key: "loss", label: "失重", children: `${analysis.keyMetrics.weightLossPercent ?? "-"}%` }
        ]} />
        <TextList title="曲线判断" items={analysis.curveAssessment} />
        <TextList title="风险提示" items={analysis.riskNotes} />
        <TextList title="下次建议" items={analysis.nextRoastSuggestions} />
      </Space>
    </Card>
  );
}

function TextList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <Divider>{title}</Divider>
      <ul className="compact-list">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

function formatMetric(metric: { time?: string | null; temperatureC?: number | null } | null | undefined) {
  if (!metric) return "未识别";
  const time = metric.time ?? "-";
  const temp = metric.temperatureC ? `${metric.temperatureC}°C` : "-";
  return `${time} / ${temp}`;
}

function formatSeconds(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) return "N/A";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

function formatNumber(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "N/A";
  return value.toFixed(1);
}

function downsample<T>(items: T[], maxItems: number) {
  if (items.length <= maxItems) return items;
  const stride = Math.ceil(items.length / maxItems);
  return items.filter((_, index) => index % stride === 0);
}

function historyItemToResult(item: UploadHistoryItem): UploadAnalysisResult {
  const profile = item.profile ? roastProfileToKpro(item.profile) : undefined;
  const analysis = item.log?.confirmed_analysis ?? item.log?.ai_analysis ?? undefined;
  return {
    uploadId: item.upload.id,
    hash: item.upload.file_hash,
    fileName: item.upload.file_name,
    fileKind: item.upload.file_kind,
    mimeType: item.upload.mime_type,
    size: item.upload.size_bytes,
    status: item.upload.parse_status,
    duplicate: true,
    storagePath: item.upload.storage_path,
    persisted: true,
    profile,
    klog: item.log?.parsed_payload ?? undefined,
    logAnalysis: analysis ?? undefined
  };
}

function getResultCurvePoints(result: UploadAnalysisResult) {
  if (result.profile?.roastCurvePoints?.length) {
    return { temp: result.profile.roastCurvePoints, fan: result.profile.fanCurvePoints };
  }
  if (result.klog?.samples?.length) {
    const temp = downsample(result.klog.samples, 180)
      .map((sample) => ({
        timeSeconds: sample.timeSeconds,
        value: sample.meanTempC ?? sample.tempC ?? sample.spotTempC ?? 0
      }))
      .filter((point) => point.value > 0);
    const fan = downsample(result.klog.samples, 180)
      .map((sample) => ({
        timeSeconds: sample.timeSeconds,
        value: sample.fanRpm ?? 0
      }))
      .filter((point) => point.value > 0);
    if (temp.length) return { temp, fan };
  }
  return null;
}

function roastProfileToKpro(profile: RoastProfileRecord): KproProfile {
  return {
    fileName: profile.file_name,
    shortName: profile.short_name,
    designer: profile.designer,
    description: profile.description,
    schemaVersion: profile.raw_fields?.profile_schema_version ?? "1.4",
    recommendedLevel: profile.recommended_level,
    expectedFirstCrackTemp: profile.expected_first_crack_temp,
    expectedColourChangeTemp: profile.expected_colour_change_temp,
    roastLevels: profile.roast_levels,
    roastCurvePoints: profile.roast_curve_points,
    fanCurvePoints: profile.fan_curve_points,
    rawFields: profile.raw_fields ?? {}
  };
}

function ratingLabel(rating: CurveScoreResult["rating"]) {
  return rating === "excellent" ? "优秀" : rating === "good" ? "良好" : rating === "review" ? "需复盘" : "偏差大";
}

function formatDate(value?: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
