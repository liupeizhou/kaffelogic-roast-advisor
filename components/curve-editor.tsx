"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Col, Input, InputNumber, Row, Space, Upload, Switch } from "antd";
import { Download, FileUp, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import AnimatedRoastCurve from "@/components/animated-roast-curve";
import OfficialProfileGuide from "@/components/official-profile-guide";
import { getDictionary, withLocale, type Locale } from "@/lib/i18n";
import { filterEditorFields, parseKpro, serializeKpro } from "@/lib/kpro";
import { defaultProfileGeneratorInput, generateKaffelogicProfile, getGeneratorSafetyNotes, type ProfileGeneratorInput } from "@/lib/profile-generator";
import { optimizeProfileCurve } from "@/lib/curve-optimizer";
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
  const zh = locale === "zh";
  const [profile, setProfile] = useState<KproProfile>(DEFAULT_PROFILE);
  const [documentId, setDocumentId] = useState<string | null>(curveId ?? null);
  const [rawText, setRawText] = useState(rawFieldsToEditorText(DEFAULT_PROFILE.rawFields));
  const [saving, setSaving] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generatorInput, setGeneratorInput] = useState<ProfileGeneratorInput>(() => defaultProfileGeneratorInput(locale));
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    if (!curveId) return;
    fetch(`/api/curves/${curveId}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as CurveResponse;
        if (!response.ok || !payload.curve) throw new Error(payload.error ?? "Load failed.");
        const nextProfile = curveToProfile(payload.curve);
        setProfile(nextProfile);
        setRawText(rawFieldsToEditorText(nextProfile.rawFields));
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
    setRawText(rawFieldsToEditorText(parsed.rawFields));
    setDocumentId(null);
    setMessage(null);
    return false;
  }

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      if (!profile.shortName?.trim()) throw new Error(zh ? "曲线名字必填。" : "Profile name is required.");
      const rawFields = JSON.parse(rawText || "{}") as Record<string, string>;
      const response = await fetch(documentId ? `/api/curves/${documentId}` : "/api/curves", {
        method: documentId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: { ...profile, rawFields }, visibility: "private" })
      });
      const payload = await response.json() as CurveResponse;
      if (!response.ok || !payload.curve) throw new Error(payload.error ?? "Save failed.");
      setDocumentId(payload.curve.id);
      setMessage(zh ? "曲线已保存并生成新版本。" : "Curve saved with a new version.");
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
      setRawText(rawFieldsToEditorText(generated.rawFields));
      setDocumentId(null);
      setMessage(zh ? "已根据目标节点生成曲线。" : "Profile generated from milestone targets.");
    } catch (generatorError) {
      setError(generatorError instanceof Error ? generatorError.message : "Generate failed.");
    }
  }

  async function optimizeRoR() {
    if (!profile.anchors || profile.anchors.length < 4) {
      setError(zh ? "需要先生成或导入 Bezier 锚点曲线。" : "Bezier anchor profile required.");
      return;
    }
    setOptimizing(true);
    setError(null);
    const events = {
      ccTemp: profile.expectedColourChangeTemp ?? 170,
      fcTemp: profile.expectedFirstCrackTemp ?? 204,
      dropTemp: profile.roastCurvePoints.length ? profile.roastCurvePoints.at(-1)!.value : 216.8
    };
    try {
      const result = optimizeProfileCurve(profile.anchors, events);
      if (result.optimized && result.acceptance?.accepted) {
        setProfile(prev => ({ ...prev, anchors: result.optimized! }));
        setMessage(zh ? "RoR 曲线已优化。" : "RoR curve optimized.");
      } else if (result.acceptance && !result.acceptance.accepted) {
        setMessage(zh ? `优化未通过: ${result.acceptance.reasons.join(", ")}` : `Rejected: ${result.acceptance.reasons.join(", ")}`);
      } else {
        setError(zh ? "优化未产生有效结果。" : "No valid optimization result.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Optimization failed.");
    } finally {
      setOptimizing(false);
    }
  }

  function downloadCurrent() {
    setError(null);
    try {
      if (!profile.shortName?.trim()) throw new Error(zh ? "曲线名字必填。" : "Profile name is required.");
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
    <div className="editor-layout">
      {/* Left: large graph area */}
      <div className="editor-graph">
        <AnimatedRoastCurve profile={animatedProfile} />
        <div className="editor-chart-grid">
          <EditableCurve
            title={t.editor.tempCurve}
            points={profile.roastCurvePoints}
            markerPoints={[
              { label: "CC", temp: profile.expectedColourChangeTemp },
              { label: "FC", temp: profile.expectedFirstCrackTemp }
            ]}
            minValue={20}
            maxValue={250}
            color="#f26735"
            yUnit="C"
            onChange={(points) => setProfile({ ...profile, roastCurvePoints: points })}
          />
          <EditableCurve
            title={t.editor.fanCurve}
            points={profile.fanCurvePoints}
            minValue={9000}
            maxValue={17000}
            color="#2563eb"
            yUnit="rpm"
            onChange={(points) => setProfile({ ...profile, fanCurvePoints: points })}
          />
        </div>
      </div>

      {/* Right: compact control panel */}
      <div className="editor-panel">
        {message ? <Alert type="success" showIcon message={message} className="editor-alert" /> : null}
        {error ? <Alert type="error" showIcon message={error} className="editor-alert" /> : null}

        {/* Toolbar */}
        <div className="editor-section">
          <div className="editor-section-label">{zh ? "操作" : "Actions"}</div>
          <div className="editor-btn-group">
            <Upload accept=".kpro" maxCount={1} beforeUpload={importFile} showUploadList={false}>
              <Button block icon={<FileUp size={14} />}>{t.editor.importKpro}</Button>
            </Upload>
            <Button type="primary" block icon={<Save size={14} />} onClick={save} loading={saving}>{t.actions.save}</Button>
            <Button block icon={<Sparkles size={14} />} onClick={optimizeRoR} loading={optimizing}>{zh ? "优化 RoR" : "Optimize RoR"}</Button>
            <Button block icon={<Download size={14} />} onClick={downloadCurrent}>{t.actions.download}</Button>
          </div>
        </div>

        {/* Metadata */}
        <div className="editor-section">
          <div className="editor-section-label">{t.editor.metadata}</div>
          <Input
            status={profile.shortName?.trim() ? undefined : "error"}
            value={profile.shortName ?? ""}
            onChange={(e) => { setProfile(prev => ({ ...prev, shortName: e.target.value })); }}
            placeholder={zh ? "曲线名字（必填）" : "Profile name (required)"}
            size="small"
          />
          <Input
            value={profile.designer ?? ""}
            onChange={(e) => setProfile(prev => ({ ...prev, designer: e.target.value }))}
            placeholder="Designer"
            size="small"
            style={{ marginTop: 6 }}
          />
          <Input.TextArea
            rows={2}
            value={profile.description ?? ""}
            onChange={(e) => setProfile(prev => ({ ...prev, description: e.target.value }))}
            placeholder="Description"
            size="small"
            style={{ marginTop: 6 }}
          />
          <Row gutter={6} style={{ marginTop: 6 }}>
            <Col span={8}><InputNumber size="small" className="full-width" value={profile.recommendedLevel} onChange={(v) => setProfile(prev => ({ ...prev, recommendedLevel: toNullableNumber(v) }))} placeholder="Level" /></Col>
            <Col span={8}><InputNumber size="small" className="full-width" value={profile.expectedFirstCrackTemp} onChange={(v) => setProfile(prev => ({ ...prev, expectedFirstCrackTemp: toNullableNumber(v) }))} placeholder="FC" addonAfter="°" /></Col>
            <Col span={8}><InputNumber size="small" className="full-width" value={profile.expectedColourChangeTemp} onChange={(v) => setProfile(prev => ({ ...prev, expectedColourChangeTemp: toNullableNumber(v) }))} placeholder="CC" addonAfter="°" /></Col>
          </Row>
        </div>

        {/* Phase panel — Kaffelogic Studio style */}
        <div className="editor-section">
          <div className="editor-section-label">{zh ? "烘焙阶段" : "Roast phases"}</div>
          <PhasePanel
            points={profile.roastCurvePoints}
            ccTemp={profile.expectedColourChangeTemp}
            fcTemp={profile.expectedFirstCrackTemp}
          />
        </div>

        {/* Point list — compact, collapsed by default */}
        <details className="editor-section" open={false}>
          <summary className="editor-section-label" style={{ cursor: "pointer" }}>{zh ? "温度点位" : "Temp points"}</summary>
          <div className="editor-point-list" style={{ marginTop: 6 }}>
            {profile.roastCurvePoints.map((point, index) => (
              <div className="editor-point-row" key={index}>
                <InputNumber
                  size="small"
                  value={point.timeSeconds}
                  addonAfter="s"
                  onChange={(v) => {
                    const pts = updatePoint(profile.roastCurvePoints, index, { timeSeconds: Number(v ?? 0) });
                    setProfile(prev => ({ ...prev, roastCurvePoints: pts }));
                  }}
                />
                <InputNumber
                  size="small"
                  value={point.value}
                  addonAfter="C"
                  onChange={(v) => {
                    const pts = updatePoint(profile.roastCurvePoints, index, { value: Number(v ?? 0) });
                    setProfile(prev => ({ ...prev, roastCurvePoints: pts }));
                  }}
                />
                <Button size="small" icon={<Trash2 size={12} />} danger onClick={() => {
                  const pts = profile.roastCurvePoints.filter((_, i) => i !== index);
                  setProfile(prev => ({ ...prev, roastCurvePoints: pts }));
                }} />
              </div>
            ))}
            <Button size="small" block icon={<Plus size={12} />} onClick={() => {
              const last = profile.roastCurvePoints.at(-1);
              const pt: CurvePoint = { timeSeconds: (last?.timeSeconds ?? 0) + 30, value: last?.value ?? 0 };
              setProfile(prev => ({ ...prev, roastCurvePoints: [...prev.roastCurvePoints, pt].sort((a, b) => a.timeSeconds - b.timeSeconds) }));
            }}>
              {zh ? "添加点" : "Add point"}
            </Button>
          </div>
        </details>

        <details className="editor-section" open={false}>
          <summary className="editor-section-label" style={{ cursor: "pointer" }}>{zh ? "风速点位" : "Fan points"}</summary>
          <div className="editor-point-list" style={{ marginTop: 6 }}>
            {profile.fanCurvePoints.map((point, index) => (
              <div className="editor-point-row" key={index}>
                <InputNumber
                  size="small"
                  value={point.timeSeconds}
                  addonAfter="s"
                  onChange={(v) => {
                    const pts = updatePoint(profile.fanCurvePoints, index, { timeSeconds: Number(v ?? 0) });
                    setProfile(prev => ({ ...prev, fanCurvePoints: pts }));
                  }}
                />
                <InputNumber
                  size="small"
                  value={point.value}
                  addonAfter="rpm"
                  onChange={(v) => {
                    const pts = updatePoint(profile.fanCurvePoints, index, { value: Number(v ?? 0) });
                    setProfile(prev => ({ ...prev, fanCurvePoints: pts }));
                  }}
                />
                <Button size="small" icon={<Trash2 size={12} />} danger onClick={() => {
                  const pts = profile.fanCurvePoints.filter((_, i) => i !== index);
                  setProfile(prev => ({ ...prev, fanCurvePoints: pts }));
                }} />
              </div>
            ))}
            <Button size="small" block icon={<Plus size={12} />} onClick={() => {
              const last = profile.fanCurvePoints.at(-1);
              const pt: CurvePoint = { timeSeconds: (last?.timeSeconds ?? 0) + 30, value: last?.value ?? 14700 };
              setProfile(prev => ({ ...prev, fanCurvePoints: [...prev.fanCurvePoints, pt].sort((a, b) => a.timeSeconds - b.timeSeconds) }));
            }}>
              {zh ? "添加点" : "Add point"}
            </Button>
          </div>
        </details>

        {/* Generator */}
        <div className="editor-section">
          <div className="editor-section-label">{zh ? "目标生成器" : "Target generator"}</div>
          <ProfileTargetGenerator locale={locale} value={generatorInput} onChange={setGeneratorInput} onApply={applyGenerator} />
        </div>

        {/* Guide */}
        <div className="editor-section">
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
        </div>

        {/* Raw fields */}
        <div className="editor-section">
          <Space>
            <span className="editor-section-label" style={{ display: "inline" }}>{t.editor.rawFields}</span>
            <Switch size="small" checked={showRaw} onChange={setShowRaw} />
          </Space>
          {showRaw ? <Input.TextArea rows={10} value={rawText} onChange={(e) => setRawText(e.target.value)} style={{ marginTop: 6 }} size="small" /> : null}
        </div>
      </div>
    </div>
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
    try { return generateKaffelogicProfile(value); } catch { return null; }
  }, [value]);
  const safetyNotes = useMemo(() => getGeneratorSafetyNotes(value, locale), [locale, value]);

  return (
    <div className="generator-inline">
      <Input size="small" value={value.shortName} onChange={(e) => onChange({ ...value, shortName: e.target.value })} placeholder={zh ? "曲线名称" : "Profile name"} style={{ marginBottom: 8 }} />
      <Row gutter={[6, 6]}>
        <Col span={12}>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>Start</div>
          <InputNumber size="small" className="full-width" min={0} max={60} value={value.startTemp} addonAfter="C" onChange={(v) => onChange({ ...value, startTemp: Number(v ?? 33) })} />
        </Col>
        <Col span={12}>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>CC</div>
          <Row gutter={4}>
            <Col span={12}><InputNumber size="small" className="full-width" min={90} max={360} value={value.cc.t} addonAfter="s" onChange={(v) => onChange({ ...value, cc: { ...value.cc, t: Number(v ?? 131) } })} /></Col>
            <Col span={12}><InputNumber size="small" className="full-width" min={140} max={180} step={0.1} value={value.cc.T} addonAfter="C" onChange={(v) => onChange({ ...value, cc: { ...value.cc, T: Number(v ?? 155) } })} /></Col>
          </Row>
        </Col>
      </Row>
      <Row gutter={[6, 6]} style={{ marginTop: 6 }}>
        <Col span={12}>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>FC</div>
          <Row gutter={4}>
            <Col span={12}><InputNumber size="small" className="full-width" min={210} max={660} value={value.fc.t} addonAfter="s" onChange={(v) => onChange({ ...value, fc: { ...value.fc, t: Number(v ?? 326) } })} /></Col>
            <Col span={12}><InputNumber size="small" className="full-width" min={180} max={220} step={0.1} value={value.fc.T} addonAfter="C" onChange={(v) => onChange({ ...value, fc: { ...value.fc, T: Number(v ?? 207) } })} /></Col>
          </Row>
        </Col>
        <Col span={12}>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>Drop</div>
          <Row gutter={4}>
            <Col span={12}><InputNumber size="small" className="full-width" min={300} max={960} value={value.drop.t} addonAfter="s" onChange={(v) => onChange({ ...value, drop: { ...value.drop, t: Number(v ?? 415) } })} /></Col>
            <Col span={12}><InputNumber size="small" className="full-width" min={190} max={240} step={0.1} value={value.drop.T} addonAfter="C" onChange={(v) => onChange({ ...value, drop: { ...value.drop, T: Number(v ?? 216.8) } })} /></Col>
          </Row>
        </Col>
      </Row>
      {preview ? (
        <div className="generator-note-panel" style={{ marginTop: 8 }}>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12 }}>
            {safetyNotes.slice(0, 2).map((n) => <li key={n}>{n}</li>)}
          </ul>
        </div>
      ) : null}
      <Button type="primary" size="small" block onClick={onApply} style={{ marginTop: 8 }}>
        {zh ? "生成曲线并应用到编辑器" : "Generate & apply"}
      </Button>
    </div>
  );
}

function EditableCurve({ title, points, markerPoints, minValue, maxValue, color, yUnit, onChange }: {
  title: string;
  points: CurvePoint[];
  markerPoints?: Array<{ label: string; temp: number | null }>;
  minValue: number;
  maxValue: number;
  color: string;
  yUnit: string;
  onChange: (points: CurvePoint[]) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; t: number; v: number } | null>(null);
  const plot = { left: 50, right: 750, top: 16, bottom: 184 };
  const w = 800, h = 220;

  if (!points.length) {
    return (
      <div className="editor-curve-wrap">
        <div className="editor-curve-title">{title}</div>
        <svg ref={svgRef} viewBox={`0 0 ${w} ${h}`} className="editable-curve">
          <rect x="0" y="0" width={w} height={h} rx="8" fill="#fbfcf9" />
          <AxisGrid plot={plot} minValue={minValue} maxValue={maxValue} maxTime={600} yUnit={yUnit} />
          <text x={w / 2} y={h / 2} textAnchor="middle" fill="#9ca59d" fontSize="13">{yUnit === "C" ? "No curve points" : "No fan points"}</text>
        </svg>
      </div>
    );
  }

  const maxTime = Math.max(...points.map(p => p.timeSeconds), 1);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${tx(p, maxTime, plot)} ${ty(p, minValue, maxValue, plot)}`).join(" ");

  function handleHover(e: React.PointerEvent<SVGSVGElement>) {
    const rect = svgRef.current!.getBoundingClientRect();
    const sx = (e.clientX - rect.left) / rect.width * w;
    const sy = (e.clientY - rect.top) / rect.height * h;
    if (sx < plot.left || sx > plot.right || sy < plot.top || sy > plot.bottom) { setHover(null); return; }
    const t = ((sx - plot.left) / (plot.right - plot.left)) * maxTime;
    const v = interpolateCurve(points, t);
    setHover({ x: sx, y: tyi(v, minValue, maxValue, plot), t, v });
  }

  function drag(idx: number, e: React.PointerEvent<SVGCircleElement>) {
    const svg = svgRef.current!;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = svg.getBoundingClientRect();
    const sx = (e.clientX - rect.left) / rect.width * w;
    const sy = (e.clientY - rect.top) / rect.height * h;
    const nxt = Math.max(0, Math.min(maxTime, ((sx - plot.left) / (plot.right - plot.left)) * maxTime));
    const nv = maxValue - ((sy - plot.top) / (plot.bottom - plot.top)) * (maxValue - minValue);
    onChange(updatePoint(points, idx, { timeSeconds: Math.round(nxt), value: Math.round(Math.max(minValue, Math.min(maxValue, nv)) * 10) / 10 }));
  }

  return (
    <div className="editor-curve-wrap">
      <div className="editor-curve-title">{title}</div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${w} ${h}`}
        className="editable-curve"
        onPointerMove={handleHover}
        onPointerLeave={() => setHover(null)}
      >
        <rect x="0" y="0" width={w} height={h} rx="8" fill="#fbfcf9" />
        <AxisGrid plot={plot} minValue={minValue} maxValue={maxValue} maxTime={maxTime} yUnit={yUnit} />
        {/* Marker lines */}
        {markerPoints?.map(m => m.temp && m.temp > 0 ? (
          <g key={m.label}>
            <line x1={plot.left} x2={plot.right} y1={tyi(m.temp, minValue, maxValue, plot)} y2={tyi(m.temp, minValue, maxValue, plot)}
              stroke={m.label === "CC" ? "#EAB308" : "#EF4444"} strokeWidth="1" strokeDasharray="4 3" opacity={0.7} />
            <text x={plot.right + 6} y={tyi(m.temp, minValue, maxValue, plot) + 4} fill={m.label === "CC" ? "#B8860B" : "#DC2626"} fontSize="9" fontWeight="600">{m.label}</text>
          </g>
        ) : null)}
        {/* Curve */}
        <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {/* Hover crosshair */}
        {hover ? (
          <g className="curve-crosshair">
            <line x1={hover.x} x2={hover.x} y1={plot.top} y2={plot.bottom} stroke="#aaa" strokeDasharray="4 3" />
            <circle cx={hover.x} cy={hover.y} r="4" fill={color} />
            <rect x={clamp(hover.x - 45, plot.left, plot.right - 90)} y={plot.bottom + 4} width="90" height="18" rx="4" fill="#1c2520" />
            <text x={clamp(hover.x, plot.left + 45, plot.right - 45)} y={plot.bottom + 16} textAnchor="middle" fill="#fff" fontSize="11">{formatSeconds(hover.t)}</text>
            <rect x="6" y={clamp(hover.y - 11, plot.top, plot.bottom - 22)} width="38" height="22" rx="4" fill="#1c2520" />
            <text x="25" y={clamp(hover.y + 4, plot.top + 15, plot.bottom - 7)} textAnchor="middle" fill="#fff" fontSize="11">{Math.round(hover.v)}{yUnit}</text>
          </g>
        ) : null}
        {/* Draggable points */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={tx(p, maxTime, plot)}
            cy={ty(p, minValue, maxValue, plot)}
            r="6" fill="#fff" stroke={color} strokeWidth="2.5"
            onPointerMove={(e) => e.buttons === 1 ? drag(i, e) : undefined}
            onPointerUp={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}
            onPointerCancel={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}
          />
        ))}
      </svg>
    </div>
  );
}

function AxisGrid({ plot, minValue, maxValue, maxTime, yUnit }: {
  plot: { left: number; right: number; top: number; bottom: number };
  minValue: number; maxValue: number; maxTime: number; yUnit: string;
}) {
  const lines: React.ReactElement[] = [];
  for (let i = 0; i <= 4; i++) {
    const r = i / 4;
    const y = plot.bottom - r * (plot.bottom - plot.top);
    const v = minValue + r * (maxValue - minValue);
    const x = plot.left + r * (plot.right - plot.left);
    const ts = r * maxTime;
    lines.push(<line key={`y${i}`} x1={plot.left} x2={plot.right} y1={y} y2={y} stroke="#e8e8e8" />);
    lines.push(<text key={`yl${i}`} x={plot.left - 8} y={y + 4} textAnchor="end" fill="#5f6f65" fontSize="10">{Math.round(v)}{yUnit}</text>);
    lines.push(<line key={`x${i}`} x1={x} x2={x} y1={plot.bottom} y2={plot.bottom + 4} stroke="#9aa59d" />);
    lines.push(<text key={`xl${i}`} x={x} y={plot.bottom + 16} textAnchor="middle" fill="#5f6f65" fontSize="10">{formatSeconds(ts)}</text>);
  }
  lines.push(<line key="yaxis" x1={plot.left} x2={plot.left} y1={plot.top} y2={plot.bottom} stroke="#9aa59d" />);
  lines.push(<line key="xaxis" x1={plot.left} x2={plot.right} y1={plot.bottom} y2={plot.bottom} stroke="#9aa59d" />);
  return <g>{lines}</g>;
}

function tx(p: CurvePoint, maxT: number, plot: { left: number; right: number }) {
  return plot.left + (p.timeSeconds / maxT) * (plot.right - plot.left);
}
function ty(p: CurvePoint, minV: number, maxV: number, plot: { top: number; bottom: number }) {
  return plot.bottom - ((p.value - minV) / Math.max(maxV - minV, 1)) * (plot.bottom - plot.top);
}
function tyi(v: number, minV: number, maxV: number, plot: { top: number; bottom: number }) {
  return plot.bottom - ((v - minV) / Math.max(maxV - minV, 1)) * (plot.bottom - plot.top);
}
function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

function interpolateCurve(points: CurvePoint[], t: number): number {
  const sorted = [...points].sort((a, b) => a.timeSeconds - b.timeSeconds);
  if (t <= sorted[0].timeSeconds) return sorted[0].value;
  for (let i = 1; i < sorted.length; i++) {
    if (t <= sorted[i].timeSeconds) {
      const r = (t - sorted[i - 1].timeSeconds) / Math.max(sorted[i].timeSeconds - sorted[i - 1].timeSeconds, 1);
      return sorted[i - 1].value + (sorted[i].value - sorted[i - 1].value) * r;
    }
  }
  return sorted.at(-1)?.value ?? 0;
}

function updatePoint(pts: CurvePoint[], i: number, p: Partial<CurvePoint>) {
  return pts.map((pt, j) => j === i ? { ...pt, ...p } : pt).sort((a, b) => a.timeSeconds - b.timeSeconds);
}

function toNullableNumber(v: string | number | null) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function formatSeconds(s: number) { const m = Math.floor(s / 60); const r = Math.round(s % 60).toString().padStart(2, "0"); return `${m}:${r}`; }
function sanitizeFileName(v: string) { return v.replace(/[^a-zA-Z0-9一-龥_-]+/g, "_").replace(/^_+|_+$/g, "") || "kaffelogic-profile"; }

function rawFieldsToEditorText(rawFields: Record<string, string>) {
  const groups = filterEditorFields(rawFields);
  return JSON.stringify({
    ...groups.metadata,
    ...groups.phases,
    ...groups.controls,
    ...groups.internal
  }, null, 2);
}

function PhasePanel({ points, ccTemp, fcTemp }: { points: CurvePoint[]; ccTemp: number | null; fcTemp: number | null }) {
  const metrics = useMemo(() => computePhaseMetrics(points, ccTemp, fcTemp), [points, ccTemp, fcTemp]);

  if (!metrics) {
    return <div style={{ fontSize: 12, color: "#999", padding: "8px 0" }}>No phase data available. Add at least 2 curve points.</div>;
  }

  const phases: Array<{ key: keyof PhaseMetrics; label: string; labelEn: string; color: string }> = [
    { key: "drying", label: "干燥", labelEn: "Drying", color: "#d4b44c" },
    { key: "maillard", label: "Maillard", labelEn: "Maillard", color: "#f0b86a" },
    { key: "development", label: "发展", labelEn: "Development", color: "#f5908f" }
  ];

  return (
    <div className="phase-panel">
      {phases.map(({ key, label, color }) => {
        const m = metrics[key];
        return (
          <div key={key} className="phase-row">
            <div className="phase-color" style={{ background: color }} />
            <div className="phase-info">
              <span className="phase-name">{label}</span>
              <span className="phase-metric">{formatSeconds(m.duration)}</span>
              <span className="phase-metric">{m.pct}%</span>
              <span className="phase-metric" style={{ color: m.rise >= 0 ? "#15803d" : "#b91c1c" }}>
                {m.rise >= 0 ? "+" : ""}{m.rise}°C
              </span>
            </div>
          </div>
        );
      })}
      <div className="phase-bar">
        <div className="phase-bar-seg drying" style={{ flex: `${metrics.drying.pct} 1 0%`, background: "#d4b44c" }} />
        <div className="phase-bar-seg maillard" style={{ flex: `${metrics.maillard.pct} 1 0%`, background: "#f0b86a" }} />
        <div className="phase-bar-seg development" style={{ flex: `${metrics.development.pct} 1 0%`, background: "#f5908f" }} />
      </div>
    </div>
  );
}

type PhaseMetrics = {
  drying:   { duration: number; pct: number; rise: number };
  maillard: { duration: number; pct: number; rise: number };
  development: { duration: number; pct: number; rise: number };
};

function computePhaseMetrics(points: CurvePoint[], ccTemp: number | null, fcTemp: number | null): PhaseMetrics | null {
  if (points.length < 2) return null;
  const sorted = [...points].sort((a, b) => a.timeSeconds - b.timeSeconds);
  const start = sorted[0];
  const end = sorted.at(-1)!;
  const totalDuration = end.timeSeconds - start.timeSeconds;
  if (totalDuration <= 0) return null;

  const ccTime = ccTemp ? crossingTimeFromPoints(sorted, ccTemp) : null;
  const fcTime = fcTemp ? crossingTimeFromPoints(sorted, fcTemp) : null;
  const dryEnd = ccTime ?? totalDuration * 0.42;
  const fcSec  = fcTime ?? totalDuration * 0.78;

  const dryingDur   = dryEnd;
  const maillardDur = Math.max(0, fcSec - dryEnd);
  const devDur      = Math.max(0, end.timeSeconds - fcSec);

  const dryRise   = interpolateCurve(sorted, dryEnd) - start.value;
  const maRise    = interpolateCurve(sorted, fcSec) - interpolateCurve(sorted, dryEnd);
  const devRise   = end.value - interpolateCurve(sorted, fcSec);

  return {
    drying:   { duration: dryingDur,   pct: Math.round(dryingDur / totalDuration * 100),   rise: Math.round(dryRise * 10) / 10 },
    maillard: { duration: maillardDur, pct: Math.round(maillardDur / totalDuration * 100), rise: Math.round(maRise * 10) / 10 },
    development: { duration: devDur,  pct: Math.round(devDur / totalDuration * 100),       rise: Math.round(devRise * 10) / 10 }
  };
}

function crossingTimeFromPoints(points: CurvePoint[], target: number): number | null {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if ((a.value <= target && b.value >= target) || (a.value >= target && b.value <= target)) {
      if (b.value === a.value) return b.timeSeconds;
      return Math.round(a.timeSeconds + ((target - a.value) / (b.value - a.value)) * (b.timeSeconds - a.timeSeconds));
    }
  }
  return null;
}

function curveToProfile(c: NonNullable<CurveResponse["curve"]>): KproProfile {
  return {
    fileName: `${c.short_name ?? c.title}.kpro`, shortName: c.short_name, designer: c.designer,
    description: c.description, schemaVersion: c.raw_fields?.profile_schema_version ?? "1.4",
    recommendedLevel: c.recommended_level, expectedFirstCrackTemp: c.expected_first_crack_temp,
    expectedColourChangeTemp: c.expected_colour_change_temp, roastLevels: c.roast_levels,
    roastCurvePoints: c.roast_curve_points, fanCurvePoints: c.fan_curve_points,
    rawFields: c.raw_fields ?? {}
  };
}
