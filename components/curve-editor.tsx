"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, Col, Divider, Input, InputNumber, Row, Space, Tabs, Upload } from "antd";
import { Download, FileUp, Plus, Save, Trash2 } from "lucide-react";
import AnimatedRoastCurve from "@/components/animated-roast-curve";
import OfficialProfileGuide from "@/components/official-profile-guide";
import { getDictionary, withLocale, type Locale } from "@/lib/i18n";
import { parseKpro, serializeKpro } from "@/lib/kpro";
import { defaultProfileGeneratorInput, generateKaffelogicProfile, getGeneratorSafetyNotes, type ProfileGeneratorInput, type RoastTarget } from "@/lib/profile-generator";
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
  const [rawText, setRawText] = useState(JSON.stringify(DEFAULT_PROFILE.rawFields, null, 2));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generatorInput, setGeneratorInput] = useState<ProfileGeneratorInput>(() => defaultProfileGeneratorInput(locale));

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
      if (!profile.shortName?.trim()) throw new Error(locale === "zh" ? "曲线名字必填。" : "Profile name is required.");
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

  function applyGenerator() {
    setError(null);
    setMessage(null);
    try {
      const generated = generateKaffelogicProfile(generatorInput);
      setProfile(generated);
      setRawText(JSON.stringify(generated.rawFields, null, 2));
      setDocumentId(null);
      setMessage(locale === "zh" ? "已根据目标节点生成 Kaffelogic 曲线，可继续微调或下载 .kpro。" : "Generated a Kaffelogic profile from target milestones. You can fine-tune or download it.");
    } catch (generatorError) {
      setError(generatorError instanceof Error ? generatorError.message : "Generate failed.");
    }
  }

  function downloadCurrent() {
    setError(null);
    try {
      if (!profile.shortName?.trim()) throw new Error(locale === "zh" ? "曲线名字必填。" : "Profile name is required.");
      const rawFields = JSON.parse(rawText || "{}") as Record<string, string>;
      const text = serializeKpro({ ...profile, rawFields });
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${sanitizeFileName(profile.shortName || profile.fileName)}.kpro`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Download failed.");
    }
  }

  return (
    <Space orientation="vertical" size={16} className="full-width">
      {message ? <Alert type="success" showIcon message={message} /> : null}
      {error ? <Alert type="error" showIcon message={error} /> : null}
      <Card>
        <Space size={12} wrap>
          <Upload accept=".kpro" maxCount={1} beforeUpload={importFile} showUploadList={false}>
            <Button icon={<FileUp size={16} />}>{t.editor.importKpro}</Button>
          </Upload>
          <Button type="primary" icon={<Save size={16} />} onClick={save} loading={saving}>{t.actions.save}</Button>
          <Button icon={<Download size={16} />} onClick={downloadCurrent}>{t.actions.download}</Button>
        </Space>
      </Card>

      <Row gutter={[16, 16]} align="top">
        <Col xs={24} xl={14}>
          <AnimatedRoastCurve profile={animatedProfile} />
          <Card className="editor-chart-card" title={t.editor.tempCurve}>
            <EditableCurve points={profile.roastCurvePoints} minValue={20} maxValue={240} color="#f26735" yUnit="C" onChange={(points) => setProfile({ ...profile, roastCurvePoints: points })} />
          </Card>
          <Card className="editor-chart-card" title={t.editor.fanCurve}>
            <EditableCurve points={profile.fanCurvePoints} minValue={9000} maxValue={17000} color="#2563eb" yUnit="rpm" onChange={(points) => setProfile({ ...profile, fanCurvePoints: points })} />
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
                key: "generator",
                label: locale === "zh" ? "目标生成器" : "Target generator",
                children: (
                  <ProfileTargetGenerator
                    locale={locale}
                    value={generatorInput}
                    onChange={setGeneratorInput}
                    onApply={applyGenerator}
                  />
                )
              },
              {
                key: "metadata",
                label: t.editor.metadata,
                children: <MetadataEditor profile={profile} onChange={(nextProfile) => {
                  setProfile(nextProfile);
                  setRawText(JSON.stringify(nextProfile.rawFields, null, 2));
                }} />
              },
              {
                key: "points",
                label: locale === "zh" ? "点位" : "Points",
                children: (
                  <Space orientation="vertical" size={16} className="full-width">
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
  function updateRawField(key: string, value: string) {
    onChange({ ...profile, rawFields: { ...profile.rawFields, [key]: value } });
  }

  return (
    <Space orientation="vertical" size={12} className="full-width">
      <Input status={profile.shortName?.trim() ? undefined : "error"} value={profile.shortName ?? ""} onChange={(event) => onChange({ ...profile, shortName: event.target.value })} placeholder="曲线名字（必填） / profile_short_name" />
      <Input value={profile.designer ?? ""} onChange={(event) => onChange({ ...profile, designer: event.target.value })} placeholder="profile_designer" />
      <Input.TextArea rows={5} value={profile.description ?? ""} onChange={(event) => onChange({ ...profile, description: event.target.value })} placeholder="profile_description" />
      <Row gutter={[10, 10]}>
        <Col span={8}><InputNumber className="full-width" value={profile.recommendedLevel} onChange={(value) => onChange({ ...profile, recommendedLevel: toNullableNumber(value) })} placeholder="Level" /></Col>
        <Col span={8}><InputNumber className="full-width" value={profile.expectedFirstCrackTemp} onChange={(value) => onChange({ ...profile, expectedFirstCrackTemp: toNullableNumber(value) })} placeholder="FC" /></Col>
        <Col span={8}><InputNumber className="full-width" value={profile.expectedColourChangeTemp} onChange={(value) => onChange({ ...profile, expectedColourChangeTemp: toNullableNumber(value) })} placeholder="Color" /></Col>
      </Row>
      <Input value={profile.roastLevels.join(",")} onChange={(event) => onChange({ ...profile, roastLevels: event.target.value.split(",").map(Number).filter(Number.isFinite) })} placeholder="roast_levels" />
      <Divider plain>咖啡生豆信息</Divider>
      <Input value={profile.rawFields.green_origin ?? ""} onChange={(event) => updateRawField("green_origin", event.target.value)} placeholder="产地 / Origin" />
      <Input value={profile.rawFields.green_region ?? ""} onChange={(event) => updateRawField("green_region", event.target.value)} placeholder="产区 / Region" />
      <Input value={profile.rawFields.green_farm ?? ""} onChange={(event) => updateRawField("green_farm", event.target.value)} placeholder="庄园 / Farm" />
      <Input value={profile.rawFields.green_variety ?? ""} onChange={(event) => updateRawField("green_variety", event.target.value)} placeholder="豆种 / Variety" />
      <Input value={profile.rawFields.green_lot ?? ""} onChange={(event) => updateRawField("green_lot", event.target.value)} placeholder="地块/批次 / Lot" />
      <Input value={profile.rawFields.green_process ?? ""} onChange={(event) => updateRawField("green_process", event.target.value)} placeholder="处理法 / Process" />
      <Input.TextArea rows={3} value={profile.rawFields.green_processing_detail ?? ""} onChange={(event) => updateRawField("green_processing_detail", event.target.value)} placeholder="处理工艺细节 / Processing detail" />
      <Input.TextArea rows={3} value={profile.rawFields.green_flavor_notes ?? ""} onChange={(event) => updateRawField("green_flavor_notes", event.target.value)} placeholder="风味描述 / Flavor notes" />
      <Row gutter={[10, 10]}>
        <Col span={8}><Input value={profile.rawFields.green_altitude_m ?? ""} onChange={(event) => updateRawField("green_altitude_m", event.target.value)} placeholder="海拔 m" /></Col>
        <Col span={8}><Input value={profile.rawFields.green_moisture_percent ?? ""} onChange={(event) => updateRawField("green_moisture_percent", event.target.value)} placeholder="含水率 %" /></Col>
        <Col span={8}><Input value={profile.rawFields.green_density_g_l ?? ""} onChange={(event) => updateRawField("green_density_g_l", event.target.value)} placeholder="密度 g/L" /></Col>
      </Row>
      <Input value={profile.rawFields.target_roast_degree ?? ""} onChange={(event) => updateRawField("target_roast_degree", event.target.value)} placeholder="建议烘焙度 / Target roast degree" />
    </Space>
  );
}

function ProfileTargetGenerator({ locale, value, onChange, onApply }: {
  locale: Locale;
  value: ProfileGeneratorInput;
  onChange: (input: ProfileGeneratorInput) => void;
  onApply: () => void;
}) {
  const zh = locale === "zh";
  const preview = useMemo(() => {
    try {
      return generateKaffelogicProfile(value);
    } catch {
      return null;
    }
  }, [value]);
  const safetyNotes = useMemo(() => getGeneratorSafetyNotes(value), [value]);

  function updateTarget(key: "cc" | "fc" | "drop", patch: Partial<RoastTarget>) {
    onChange({ ...value, [key]: { ...value[key], ...patch } });
  }

  function updateFan(patch: Partial<ProfileGeneratorInput["fan"]>) {
    onChange({ ...value, fan: { ...value.fan, ...patch } });
  }

  function updateRor(patch: Partial<ProfileGeneratorInput["rorInterval"]>) {
    onChange({ ...value, rorInterval: { ...value.rorInterval, ...patch } });
  }

  return (
    <Space orientation="vertical" size={14} className="full-width">
      <Alert
        type="info"
        showIcon
        message={zh ? "按 Start / CC / FC / Drop 目标生成曲线" : "Generate a curve from Start / CC / FC / Drop targets"}
        description={zh
          ? "这只是带关键节点的曲线初稿，不是直接可烘焙的最终曲线。生成后请继续检查 CC、FC、发展段和风速。"
          : "This is a milestone-based draft, not a final roast-ready profile. After generation, review CC, FC, development and fan behavior."}
      />
      <Input
        value={value.shortName}
        onChange={(event) => onChange({ ...value, shortName: event.target.value })}
        placeholder={zh ? "曲线名称" : "Profile name"}
      />
      <Row gutter={[10, 10]}>
        <Col xs={24} md={8}>
          <Card size="small" title="Start">
            <InputNumber className="full-width" min={0} max={60} step={0.1} value={value.startTemp} addonAfter="C" onChange={(next) => onChange({ ...value, startTemp: Number(next ?? 0) })} />
          </Card>
        </Col>
        <GeneratorTargetCard title="CC" target={value.cc} minTime={90} maxTime={360} minTemp={140} maxTemp={180} onChange={(patch) => updateTarget("cc", patch)} />
        <GeneratorTargetCard title="FC" target={value.fc} minTime={210} maxTime={660} minTemp={180} maxTemp={220} onChange={(patch) => updateTarget("fc", patch)} />
        <GeneratorTargetCard title="Drop" target={value.drop} minTime={300} maxTime={960} minTemp={190} maxTemp={240} onChange={(patch) => updateTarget("drop", patch)} />
      </Row>
      <Row gutter={[10, 10]}>
        <Col xs={24} md={12}>
          <Card size="small" title={zh ? "RoR 下降优化区间" : "RoR decline interval"}>
            <Row gutter={8}>
              <Col span={12}><InputNumber className="full-width" min={0} max={value.drop.t - 10} value={value.rorInterval.startSec} addonAfter="s" onChange={(next) => updateRor({ startSec: Number(next ?? 0) })} /></Col>
              <Col span={12}><InputNumber className="full-width" min={value.rorInterval.startSec + 10} max={value.drop.t} value={value.rorInterval.endSec} addonAfter="s" onChange={(next) => updateRor({ endSec: Number(next ?? 0) })} /></Col>
            </Row>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card size="small" title={zh ? "风速控制" : "Fan control"}>
            <Row gutter={8}>
              <Col span={8}><InputNumber className="full-width" min={13000} max={15000} step={100} value={value.fan.startRpm} addonAfter="rpm" onChange={(next) => updateFan({ startRpm: Number(next ?? 14700) })} /></Col>
              <Col span={8}><InputNumber className="full-width" min={13000} max={15000} step={100} value={value.fan.descentRpm} addonAfter="rpm" onChange={(next) => updateFan({ descentRpm: Number(next ?? 14200) })} /></Col>
              <Col span={8}><InputNumber className="full-width" min={-60} max={60} value={value.fan.descentOffsetSec} addonAfter="s←FC" onChange={(next) => updateFan({ descentOffsetSec: Number(next ?? 5) })} /></Col>
            </Row>
          </Card>
        </Col>
      </Row>
      {preview ? (
        <>
          <div className="generator-preview-strip">
            <span>{zh ? "推荐 Level" : "Recommended level"} <strong>{preview.recommendedLevel}</strong></span>
            <span>{zh ? "温度点/节点" : "Temp points"} <strong>{preview.roastCurvePoints.length}</strong></span>
            <span>{zh ? "风速点" : "Fan points"} <strong>{preview.fanCurvePoints.length}</strong></span>
            <span>{zh ? "预计一爆" : "Expected FC"} <strong>{preview.expectedFirstCrackTemp}C</strong></span>
          </div>
          <div className="generator-note-panel">
            <strong>{zh ? "生成前检查" : "Pre-generation checks"}</strong>
            <ul>
              {safetyNotes.map((note) => <li key={note}>{note}</li>)}
            </ul>
          </div>
        </>
      ) : (
        <Alert type="warning" showIcon message={zh ? "当前参数无法生成有效曲线，请检查时间和温度顺序。" : "Current parameters cannot generate a valid curve. Check time and temperature order."} />
      )}
      <Button type="primary" block onClick={onApply}>
        {zh ? "生成曲线并应用到编辑器" : "Generate profile and apply to editor"}
      </Button>
    </Space>
  );
}

function GeneratorTargetCard({ title, target, minTime, maxTime, minTemp, maxTemp, onChange }: {
  title: string;
  target: RoastTarget;
  minTime: number;
  maxTime: number;
  minTemp: number;
  maxTemp: number;
  onChange: (patch: Partial<RoastTarget>) => void;
}) {
  return (
    <Col xs={24} md={8}>
      <Card size="small" title={title}>
        <Row gutter={8}>
          <Col span={12}><InputNumber className="full-width" min={minTime} max={maxTime} value={target.t} addonAfter="s" onChange={(next) => onChange({ t: Number(next ?? minTime) })} /></Col>
          <Col span={12}><InputNumber className="full-width" min={minTemp} max={maxTemp} step={0.1} value={target.T} addonAfter="C" onChange={(next) => onChange({ T: Number(next ?? minTemp) })} /></Col>
        </Row>
      </Card>
    </Col>
  );
}

function PointEditor({ title, points, onChange }: { title: string; points: CurvePoint[]; onChange: (points: CurvePoint[]) => void }) {
  return (
    <Card size="small" title={title} extra={<Button size="small" icon={<Plus size={14} />} onClick={() => onChange([...points, { timeSeconds: (points.at(-1)?.timeSeconds ?? 0) + 30, value: points.at(-1)?.value ?? 0 }])} />}>
      <Space orientation="vertical" size={8} className="full-width">
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

function EditableCurve({ points, minValue, maxValue, color, yUnit, onChange }: {
  points: CurvePoint[];
  minValue: number;
  maxValue: number;
  color: string;
  yUnit: string;
  onChange: (points: CurvePoint[]) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; timeSeconds: number; value: number } | null>(null);
  const plot = { left: 56, right: 690, top: 20, bottom: 198 };
  if (!points.length) {
    return (
      <svg ref={svgRef} viewBox="0 0 720 240" width="100%" height="240" className="editable-curve">
        <rect x="0" y="0" width="720" height="240" rx="8" fill="#fbfcf9" />
        <Axis plot={plot} minValue={minValue} maxValue={maxValue} maxTime={600} yUnit={yUnit} />
        <text x="360" y="124" textAnchor="middle" fill="#6d7b70" fontSize="15">No curve points</text>
      </svg>
    );
  }
  const maxTime = Math.max(...points.map((point) => point.timeSeconds), 1);
  const path = points.map((point, index) => {
    const { x, y } = pointToXY(point, maxTime, minValue, maxValue, plot);
    return `${index === 0 ? "M" : "L"} ${x} ${y}`;
  }).join(" ");

  function handleHover(event: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 720;
    const y = ((event.clientY - rect.top) / rect.height) * 240;
    if (x < plot.left || x > plot.right || y < plot.top || y > plot.bottom) {
      setHover(null);
      return;
    }
    const timeSeconds = ((x - plot.left) / (plot.right - plot.left)) * maxTime;
    const value = interpolateCurve(points, timeSeconds);
    const pointY = valueToY(value, minValue, maxValue, plot);
    setHover({ x, y: pointY, timeSeconds, value });
  }

  function drag(index: number, event: React.PointerEvent<SVGCircleElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = svg.getBoundingClientRect();
    const nextX = ((event.clientX - rect.left) / rect.width) * 720;
    const nextY = ((event.clientY - rect.top) / rect.height) * 240;
    const timeSeconds = Math.max(0, Math.min(maxTime, ((nextX - plot.left) / (plot.right - plot.left)) * maxTime));
    const value = maxValue - ((nextY - plot.top) / (plot.bottom - plot.top)) * (maxValue - minValue);
    onChange(updatePoint(points, index, {
      timeSeconds: Math.round(timeSeconds),
      value: Math.round(Math.max(minValue, Math.min(maxValue, value)) * 10) / 10
    }));
  }

  function release(event: React.PointerEvent<SVGCircleElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 720 240"
      width="100%"
      height="240"
      className="editable-curve"
      onPointerMove={handleHover}
      onPointerLeave={() => setHover(null)}
    >
      <rect x="0" y="0" width="720" height="240" rx="8" fill="#fbfcf9" />
      <Axis plot={plot} minValue={minValue} maxValue={maxValue} maxTime={maxTime} yUnit={yUnit} />
      <path d={path} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {hover ? (
        <g className="curve-crosshair">
          <line x1={hover.x} x2={hover.x} y1={plot.top} y2={plot.bottom} stroke="#5f6f65" strokeDasharray="5 5" />
          <circle cx={hover.x} cy={hover.y} r="4" fill={color} />
          <rect x={Math.min(Math.max(hover.x - 58, plot.left), plot.right - 116)} y={plot.bottom + 10} width="116" height="22" rx="5" fill="#1c2520" />
          <text x={Math.min(Math.max(hover.x, plot.left + 58), plot.right - 58)} y={plot.bottom + 26} textAnchor="middle" fill="#fff" fontSize="12">{formatSeconds(hover.timeSeconds)}</text>
          <rect x="4" y={Math.min(Math.max(hover.y - 13, plot.top), plot.bottom - 26)} width="50" height="26" rx="5" fill="#1c2520" />
          <text x="29" y={Math.min(Math.max(hover.y + 4, plot.top + 17), plot.bottom - 9)} textAnchor="middle" fill="#fff" fontSize="12">{Math.round(hover.value)}{yUnit}</text>
        </g>
      ) : null}
      {points.map((point, index) => {
        const { x, y } = pointToXY(point, maxTime, minValue, maxValue, plot);
        return (
          <circle
            key={index}
            cx={x}
            cy={y}
            r="7"
            fill="#fff"
            stroke={color}
            strokeWidth="3"
            onPointerMove={(event) => event.buttons === 1 ? drag(index, event) : undefined}
            onPointerUp={release}
            onPointerCancel={release}
          />
        );
      })}
    </svg>
  );
}

function Axis({ plot, minValue, maxValue, maxTime, yUnit }: {
  plot: { left: number; right: number; top: number; bottom: number };
  minValue: number;
  maxValue: number;
  maxTime: number;
  yUnit: string;
}) {
  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  const xTicks = [0, 0.25, 0.5, 0.75, 1];
  return (
    <g>
      <line x1={plot.left} x2={plot.left} y1={plot.top} y2={plot.bottom} stroke="#9aa59d" />
      <line x1={plot.left} x2={plot.right} y1={plot.bottom} y2={plot.bottom} stroke="#9aa59d" />
      {yTicks.map((tick) => {
        const y = plot.bottom - tick * (plot.bottom - plot.top);
        const value = minValue + tick * (maxValue - minValue);
        return (
          <g key={tick}>
            <line x1={plot.left} x2={plot.right} y1={y} y2={y} stroke="#d8ddd7" />
            <text x={plot.left - 8} y={y + 4} textAnchor="end" fill="#5f6f65" fontSize="11">{Math.round(value)}{yUnit}</text>
          </g>
        );
      })}
      {xTicks.map((tick) => {
        const x = plot.left + tick * (plot.right - plot.left);
        return (
          <g key={tick}>
            <line x1={x} x2={x} y1={plot.bottom} y2={plot.bottom + 5} stroke="#9aa59d" />
            <text x={x} y={plot.bottom + 19} textAnchor="middle" fill="#5f6f65" fontSize="11">{formatSeconds(tick * maxTime)}</text>
          </g>
        );
      })}
      <text x={(plot.left + plot.right) / 2} y="235" textAnchor="middle" fill="#5f6f65" fontSize="12">Time (min:s)</text>
      <text x="14" y={(plot.top + plot.bottom) / 2} textAnchor="middle" fill="#5f6f65" fontSize="12" transform={`rotate(-90 14 ${(plot.top + plot.bottom) / 2})`}>Value ({yUnit})</text>
    </g>
  );
}

function pointToXY(point: CurvePoint, maxTime: number, minValue: number, maxValue: number, plot: { left: number; right: number; top: number; bottom: number }) {
  return {
    x: plot.left + (point.timeSeconds / maxTime) * (plot.right - plot.left),
    y: valueToY(point.value, minValue, maxValue, plot)
  };
}

function valueToY(value: number, minValue: number, maxValue: number, plot: { top: number; bottom: number }) {
  return plot.bottom - ((value - minValue) / Math.max(maxValue - minValue, 1)) * (plot.bottom - plot.top);
}

function interpolateCurve(points: CurvePoint[], timeSeconds: number) {
  const sorted = [...points].sort((a, b) => a.timeSeconds - b.timeSeconds);
  if (timeSeconds <= sorted[0].timeSeconds) return sorted[0].value;
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const next = sorted[index];
    if (timeSeconds <= next.timeSeconds) {
      const ratio = (timeSeconds - previous.timeSeconds) / Math.max(next.timeSeconds - previous.timeSeconds, 1);
      return previous.value + (next.value - previous.value) * ratio;
    }
  }
  return sorted.at(-1)?.value ?? 0;
}

function updatePoint(points: CurvePoint[], index: number, patch: Partial<CurvePoint>) {
  return points.map((point, nextIndex) => nextIndex === index ? { ...point, ...patch } : point)
    .sort((a, b) => a.timeSeconds - b.timeSeconds);
}

function toNullableNumber(value: string | number | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatSeconds(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

function sanitizeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]+/g, "_").replace(/^_+|_+$/g, "") || "kaffelogic-profile";
}

function curveToProfile(curve: NonNullable<CurveResponse["curve"]>): KproProfile {
  return {
    fileName: `${curve.short_name || curve.title}.kpro`,
    shortName: curve.short_name,
    designer: curve.designer,
    description: curve.description,
    schemaVersion: curve.raw_fields?.profile_schema_version ?? "1.4",
    recommendedLevel: curve.recommended_level,
    expectedFirstCrackTemp: curve.expected_first_crack_temp,
    expectedColourChangeTemp: curve.expected_colour_change_temp,
    roastLevels: curve.roast_levels,
    roastCurvePoints: curve.roast_curve_points,
    fanCurvePoints: curve.fan_curve_points,
    rawFields: curve.raw_fields ?? {}
  };
}
