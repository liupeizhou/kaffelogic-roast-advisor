"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, Col, Input, InputNumber, Row, Select, Space, Tabs, Upload } from "antd";
import { Download, FileUp, Plus, Save, Share2, Trash2 } from "lucide-react";
import AnimatedRoastCurve from "@/components/animated-roast-curve";
import OfficialProfileGuide from "@/components/official-profile-guide";
import { getDictionary, withLocale, type Locale } from "@/lib/i18n";
import { parseKpro } from "@/lib/kpro";
import type { CurvePoint, KproProfile } from "@/lib/types";

const DEFAULT_PROFILE: KproProfile = {
  fileName: "new-profile.kpro",
  shortName: "New Kaffelogic Profile",
  designer: "",
  description: "",
  schemaVersion: "1.4",
  recommendedLevel: 3.2,
  expectedFirstCrackTemp: 203,
  expectedColourChangeTemp: 168,
  roastLevels: [205, 208, 211, 214, 218, 222],
  roastCurvePoints: [
    { timeSeconds: 0, value: 24 },
    { timeSeconds: 60, value: 98 },
    { timeSeconds: 180, value: 145 },
    { timeSeconds: 360, value: 190 },
    { timeSeconds: 560, value: 218 }
  ],
  fanCurvePoints: [
    { timeSeconds: 0, value: 14700 },
    { timeSeconds: 180, value: 14000 },
    { timeSeconds: 360, value: 12800 },
    { timeSeconds: 560, value: 11600 }
  ],
  rawFields: { profile_schema_version: "1.4" }
};

type CurveResponse = {
  curve?: {
    id: string;
    title: string;
    short_name: string | null;
    designer: string | null;
    description: string | null;
    recommended_level: number | null;
    expected_first_crack_temp: number | null;
    expected_colour_change_temp: number | null;
    roast_levels: number[];
    roast_curve_points: CurvePoint[];
    fan_curve_points: CurvePoint[];
    raw_fields: Record<string, string>;
  };
  error?: string;
};

export default function CurveEditor({ locale, curveId }: { locale: Locale; curveId?: string }) {
  const router = useRouter();
  const t = getDictionary(locale);
  const [profile, setProfile] = useState<KproProfile>(DEFAULT_PROFILE);
  const [documentId, setDocumentId] = useState<string | null>(curveId ?? null);
  const [template, setTemplate] = useState<"barista" | "baroque" | "cyberpunk">("barista");
  const [rawText, setRawText] = useState(JSON.stringify(DEFAULT_PROFILE.rawFields, null, 2));
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!curveId) return;
    fetch(`/api/curves/${curveId}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as CurveResponse;
        if (!response.ok || !payload.curve) throw new Error(payload.error ?? "Load failed.");
        const nextProfile = curveToProfile(payload.curve);
        setProfile(nextProfile);
        setRawText(JSON.stringify(nextProfile.rawFields, null, 2));
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Load failed."));
  }, [curveId]);

  const animatedProfile = useMemo(() => ({
    display_name: profile.shortName ?? profile.fileName,
    short_name: profile.shortName,
    designer: profile.designer,
    description: profile.description,
    recommended_level: profile.recommendedLevel,
    expected_first_crack_temp: profile.expectedFirstCrackTemp,
    expected_colour_change_temp: profile.expectedColourChangeTemp,
    roast_levels: profile.roastLevels,
    roast_curve_points: profile.roastCurvePoints,
    fan_curve_points: profile.fanCurvePoints,
    source_type: "edited",
    target_brew: "filter",
    process_fit: "any"
  }), [profile]);

  async function importFile(file: File) {
    const text = await file.text();
    const parsed = parseKpro(text, file.name);
    setProfile(parsed);
    setRawText(JSON.stringify(parsed.rawFields, null, 2));
    setDocumentId(null);
    setMessage(null);
    return false;
  }

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const rawFields = JSON.parse(rawText || "{}") as Record<string, string>;
      const response = await fetch(documentId ? `/api/curves/${documentId}` : "/api/curves", {
        method: documentId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: { ...profile, rawFields }, visibility: "private" })
      });
      const payload = await response.json() as CurveResponse;
      if (!response.ok || !payload.curve) throw new Error(payload.error ?? "Save failed.");
      setDocumentId(payload.curve.id);
      setMessage(locale === "zh" ? "曲线已保存并生成新版本。" : "Curve saved with a new version.");
      if (!documentId) router.replace(withLocale(locale, `/editor/${payload.curve.id}`));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function createShare() {
    if (!documentId) {
      await save();
      return;
    }
    setSharing(true);
    setError(null);
    try {
      const response = await fetch("/api/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ curveDocumentId: documentId, template })
      });
      const payload = await response.json() as { slug?: string; error?: string };
      if (!response.ok || !payload.slug) throw new Error(payload.error ?? "Share failed.");
      router.push(withLocale(locale, `/share/${payload.slug}`));
    } catch (shareError) {
      setError(shareError instanceof Error ? shareError.message : "Share failed.");
    } finally {
      setSharing(false);
    }
  }

  return (
    <Space direction="vertical" size={16} className="full-width">
      {message ? <Alert type="success" showIcon message={message} /> : null}
      {error ? <Alert type="error" showIcon message={error} /> : null}
      <Card>
        <Space size={12} wrap>
          <Upload accept=".kpro" maxCount={1} beforeUpload={importFile} showUploadList={false}>
            <Button icon={<FileUp size={16} />}>{t.editor.importKpro}</Button>
          </Upload>
          <Button type="primary" icon={<Save size={16} />} onClick={save} loading={saving}>{t.actions.save}</Button>
          {documentId ? (
            <Link href={`/api/curves/${documentId}/download`}>
              <Button icon={<Download size={16} />}>{t.actions.download}</Button>
            </Link>
          ) : null}
          <Select value={template} onChange={setTemplate} options={[
            { value: "barista", label: t.share.barista },
            { value: "baroque", label: t.share.baroque },
            { value: "cyberpunk", label: t.share.cyberpunk }
          ]} />
          <Button icon={<Share2 size={16} />} onClick={createShare} loading={sharing}>{t.actions.share}</Button>
        </Space>
      </Card>

      <Row gutter={[16, 16]} align="top">
        <Col xs={24} xl={14}>
          <AnimatedRoastCurve profile={animatedProfile} />
          <Card className="editor-chart-card" title={t.editor.tempCurve}>
            <EditableCurve points={profile.roastCurvePoints} minValue={20} maxValue={240} color="#f26735" onChange={(points) => setProfile({ ...profile, roastCurvePoints: points })} />
          </Card>
          <Card className="editor-chart-card" title={t.editor.fanCurve}>
            <EditableCurve points={profile.fanCurvePoints} minValue={9000} maxValue={17000} color="#2563eb" onChange={(points) => setProfile({ ...profile, fanCurvePoints: points })} />
          </Card>
        </Col>
        <Col xs={24} xl={10}>
          <OfficialProfileGuide
            locale={locale}
            compact
            profile={{
              name: profile.shortName ?? profile.fileName,
              description: profile.description,
              processFit: profile.rawFields.process_fit,
              expectedColourChangeTemp: profile.expectedColourChangeTemp,
              expectedFirstCrackTemp: profile.expectedFirstCrackTemp,
              roastCurvePoints: profile.roastCurvePoints
            }}
          />
          <Tabs
            items={[
              {
                key: "metadata",
                label: t.editor.metadata,
                children: <MetadataEditor profile={profile} onChange={setProfile} />
              },
              {
                key: "points",
                label: locale === "zh" ? "点位" : "Points",
                children: (
                  <Space direction="vertical" size={16} className="full-width">
                    <PointEditor title={t.editor.tempCurve} points={profile.roastCurvePoints} onChange={(points) => setProfile({ ...profile, roastCurvePoints: points })} />
                    <PointEditor title={t.editor.fanCurve} points={profile.fanCurvePoints} onChange={(points) => setProfile({ ...profile, fanCurvePoints: points })} />
                  </Space>
                )
              },
              {
                key: "raw",
                label: t.editor.rawFields,
                children: <Input.TextArea rows={18} value={rawText} onChange={(event) => setRawText(event.target.value)} />
              }
            ]}
          />
        </Col>
      </Row>
    </Space>
  );
}

function MetadataEditor({ profile, onChange }: { profile: KproProfile; onChange: (profile: KproProfile) => void }) {
  return (
    <Space direction="vertical" size={12} className="full-width">
      <Input value={profile.shortName ?? ""} onChange={(event) => onChange({ ...profile, shortName: event.target.value })} placeholder="profile_short_name" />
      <Input value={profile.designer ?? ""} onChange={(event) => onChange({ ...profile, designer: event.target.value })} placeholder="profile_designer" />
      <Input.TextArea rows={5} value={profile.description ?? ""} onChange={(event) => onChange({ ...profile, description: event.target.value })} placeholder="profile_description" />
      <Row gutter={[10, 10]}>
        <Col span={8}><InputNumber className="full-width" value={profile.recommendedLevel} onChange={(value) => onChange({ ...profile, recommendedLevel: toNullableNumber(value) })} placeholder="Level" /></Col>
        <Col span={8}><InputNumber className="full-width" value={profile.expectedFirstCrackTemp} onChange={(value) => onChange({ ...profile, expectedFirstCrackTemp: toNullableNumber(value) })} placeholder="FC" /></Col>
        <Col span={8}><InputNumber className="full-width" value={profile.expectedColourChangeTemp} onChange={(value) => onChange({ ...profile, expectedColourChangeTemp: toNullableNumber(value) })} placeholder="Color" /></Col>
      </Row>
      <Input value={profile.roastLevels.join(",")} onChange={(event) => onChange({ ...profile, roastLevels: event.target.value.split(",").map(Number).filter(Number.isFinite) })} placeholder="roast_levels" />
    </Space>
  );
}

function PointEditor({ title, points, onChange }: { title: string; points: CurvePoint[]; onChange: (points: CurvePoint[]) => void }) {
  return (
    <Card size="small" title={title} extra={<Button size="small" icon={<Plus size={14} />} onClick={() => onChange([...points, { timeSeconds: (points.at(-1)?.timeSeconds ?? 0) + 30, value: points.at(-1)?.value ?? 0 }])} />}>
      <Space direction="vertical" size={8} className="full-width">
        {points.map((point, index) => (
          <Row key={index} gutter={8} align="middle">
            <Col span={9}><InputNumber className="full-width" value={point.timeSeconds} onChange={(value) => onChange(updatePoint(points, index, { timeSeconds: Number(value ?? 0) }))} /></Col>
            <Col span={9}><InputNumber className="full-width" value={point.value} onChange={(value) => onChange(updatePoint(points, index, { value: Number(value ?? 0) }))} /></Col>
            <Col span={6}><Button icon={<Trash2 size={14} />} onClick={() => onChange(points.filter((_, nextIndex) => nextIndex !== index))} /></Col>
          </Row>
        ))}
      </Space>
    </Card>
  );
}

function EditableCurve({ points, minValue, maxValue, color, onChange }: {
  points: CurvePoint[];
  minValue: number;
  maxValue: number;
  color: string;
  onChange: (points: CurvePoint[]) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const maxTime = Math.max(...points.map((point) => point.timeSeconds), 1);
  const path = points.map((point, index) => {
    const { x, y } = pointToXY(point, maxTime, minValue, maxValue);
    return `${index === 0 ? "M" : "L"} ${x} ${y}`;
  }).join(" ");

  function drag(index: number, event: React.PointerEvent<SVGCircleElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = svg.getBoundingClientRect();
    const nextX = ((event.clientX - rect.left) / rect.width) * 720;
    const nextY = ((event.clientY - rect.top) / rect.height) * 240;
    const timeSeconds = Math.max(0, Math.min(maxTime, ((nextX - 30) / 660) * maxTime));
    const value = maxValue - ((nextY - 20) / 180) * (maxValue - minValue);
    onChange(updatePoint(points, index, {
      timeSeconds: Math.round(timeSeconds),
      value: Math.round(Math.max(minValue, Math.min(maxValue, value)) * 10) / 10
    }));
  }

  return (
    <svg ref={svgRef} viewBox="0 0 720 240" width="100%" height="240" className="editable-curve">
      <rect x="0" y="0" width="720" height="240" rx="8" fill="#fbfcf9" />
      {[0, 1, 2, 3].map((tick) => <line key={tick} x1="30" x2="690" y1={20 + tick * 60} y2={20 + tick * 60} stroke="#d8ddd7" />)}
      <path d={path} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((point, index) => {
        const { x, y } = pointToXY(point, maxTime, minValue, maxValue);
        return <circle key={index} cx={x} cy={y} r="7" fill="#fff" stroke={color} strokeWidth="3" onPointerMove={(event) => event.buttons === 1 ? drag(index, event) : undefined} />;
      })}
    </svg>
  );
}

function pointToXY(point: CurvePoint, maxTime: number, minValue: number, maxValue: number) {
  return {
    x: 30 + (point.timeSeconds / maxTime) * 660,
    y: 200 - ((point.value - minValue) / Math.max(maxValue - minValue, 1)) * 180
  };
}

function updatePoint(points: CurvePoint[], index: number, patch: Partial<CurvePoint>) {
  return points.map((point, nextIndex) => nextIndex === index ? { ...point, ...patch } : point)
    .sort((a, b) => a.timeSeconds - b.timeSeconds);
}

function toNullableNumber(value: string | number | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function curveToProfile(curve: NonNullable<CurveResponse["curve"]>): KproProfile {
  return {
    fileName: `${curve.short_name || curve.title}.kpro`,
    shortName: curve.short_name,
    designer: curve.designer,
    description: curve.description,
    schemaVersion: curve.raw_fields.profile_schema_version ?? "1.4",
    recommendedLevel: curve.recommended_level,
    expectedFirstCrackTemp: curve.expected_first_crack_temp,
    expectedColourChangeTemp: curve.expected_colour_change_temp,
    roastLevels: curve.roast_levels,
    roastCurvePoints: curve.roast_curve_points,
    fanCurvePoints: curve.fan_curve_points,
    rawFields: curve.raw_fields
  };
}
