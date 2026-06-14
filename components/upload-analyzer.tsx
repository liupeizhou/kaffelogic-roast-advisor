"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, FileUp, Save, UploadCloud } from "lucide-react";
import { Alert, Button, Card, Col, Descriptions, Divider, Image, List, Row, Space, Tag, Upload } from "antd";
import type { UploadProps } from "antd";
import CurveChart from "@/components/curve-chart";
import { adminHeaders } from "@/lib/admin-client";
import type { RoastLogAnalysis, UploadAnalysisResult } from "@/lib/types";

export default function UploadAnalyzer() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<UploadAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const isImage = useMemo(() => file?.type.startsWith("image/") ?? false, [file]);

  function onFileChange(nextFile: File | null) {
    setFile(nextFile);
    setResult(null);
    setError(null);
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return nextFile && nextFile.type.startsWith("image/") ? URL.createObjectURL(nextFile) : null;
    });
  }

  const uploadProps: UploadProps = {
    accept: ".kpro,image/png,image/jpeg,image/webp,image/heic,image/heif",
    maxCount: 1,
    beforeUpload: (nextFile) => {
      onFileChange(nextFile);
      return false;
    },
    onRemove: () => {
      onFileChange(null);
      return true;
    }
  };

  async function analyze() {
    if (!file) return;
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.set("file", file);
    const response = await fetch("/api/uploads/analyze", {
      method: "POST",
      headers: adminHeaders(),
      body: formData
    });

    const payload = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(payload.error ?? "上传分析失败。");
      return;
    }
    setResult(payload);
  }

  async function confirmAnalysis() {
    if (!result?.uploadId || !result.logAnalysis) return;
    setConfirming(true);
    const response = await fetch("/api/uploads/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...adminHeaders() },
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
  }

  return (
    <Space orientation="vertical" size={16} className="full-width">
      <Card>
        <Space orientation="vertical" size={14} className="full-width">
          <Upload {...uploadProps}>
            <Button icon={<FileUp size={18} />}>选择文件</Button>
          </Upload>
          <Space size={12} wrap>
            <Button type="primary" icon={<UploadCloud size={18} />} disabled={!file} loading={loading} onClick={analyze}>
              分析上传
            </Button>
            <span className="muted">{file ? `${file.name} · ${Math.round(file.size / 1024)} KB` : "支持 .kpro 和 Kaffelogic log 图片，单文件最大 6MB。"}</span>
          </Space>
          {error ? <Alert type="error" showIcon message={error} /> : null}
        </Space>
      </Card>

      {previewUrl && isImage ? (
        <Card title="原始图片">
          <Image className="preview-image" src={previewUrl} alt="上传的 Kaffelogic log 图片预览" />
        </Card>
      ) : null}

      {result ? <AnalysisResult result={result} onConfirm={confirmAnalysis} confirming={confirming} /> : null}
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
          {result.profile ? <KproResult result={result} /> : null}
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
      <List size="small" dataSource={items} renderItem={(item) => <List.Item>{item}</List.Item>} />
    </div>
  );
}

function formatMetric(metric: { time?: string | null; temperatureC?: number | null } | null | undefined) {
  if (!metric) return "未识别";
  const time = metric.time ?? "-";
  const temp = metric.temperatureC ? `${metric.temperatureC}°C` : "-";
  return `${time} / ${temp}`;
}
