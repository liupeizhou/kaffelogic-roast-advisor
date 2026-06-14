"use client";

import { useId, useMemo, type ReactNode } from "react";
import { Activity, Fan, Flame, Gauge, TimerReset } from "lucide-react";
import { Tag } from "antd";
import { formatRoastTime, getOfficialProfileInsight } from "@/lib/kaffelogic-official";
import type { CurvePoint } from "@/lib/types";

export type AnimatedRoastProfile = {
  id?: string;
  display_name?: string;
  short_name?: string | null;
  designer?: string | null;
  description?: string | null;
  source_type?: string;
  target_brew?: string;
  process_fit?: string;
  recommended_level?: number | null;
  expected_first_crack_temp?: number | null;
  expected_colour_change_temp?: number | null;
  roast_levels?: number[];
  roast_curve_points?: CurvePoint[];
  fan_curve_points?: CurvePoint[];
};

type AnimatedRoastCurveProps = {
  profile?: AnimatedRoastProfile | null;
};

const DEMO_PROFILE: AnimatedRoastProfile = {
  display_name: "KL Natural Reference",
  short_name: "KL Natural",
  designer: "Kaffelogic reference",
  description: "示例曲线用于未连接 Supabase 时的视觉预览。导入 .kpro 后这里会显示真实曲线点。",
  source_type: "demo",
  target_brew: "filter",
  process_fit: "natural",
  recommended_level: 3.2,
  expected_first_crack_temp: 203,
  expected_colour_change_temp: 168,
  roast_levels: [205, 208, 211, 214, 218, 222],
  roast_curve_points: [
    { timeSeconds: 0, value: 24 },
    { timeSeconds: 45, value: 88 },
    { timeSeconds: 110, value: 128 },
    { timeSeconds: 210, value: 160 },
    { timeSeconds: 330, value: 184 },
    { timeSeconds: 455, value: 203 },
    { timeSeconds: 600, value: 218 }
  ],
  fan_curve_points: [
    { timeSeconds: 0, value: 14600 },
    { timeSeconds: 120, value: 14000 },
    { timeSeconds: 270, value: 13200 },
    { timeSeconds: 430, value: 12200 },
    { timeSeconds: 600, value: 11600 }
  ]
};

const EMPTY_CURVE_POINTS: CurvePoint[] = [];

export default function AnimatedRoastCurve({ profile }: AnimatedRoastCurveProps) {
  const activeProfile = profile ?? DEMO_PROFILE;
  const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const tempPoints = activeProfile.roast_curve_points ?? EMPTY_CURVE_POINTS;
  const fanPoints = activeProfile.fan_curve_points ?? EMPTY_CURVE_POINTS;
  const geometry = useMemo(
    () => createGeometry(tempPoints, fanPoints, activeProfile.expected_first_crack_temp ?? null, activeProfile.expected_colour_change_temp ?? null),
    [tempPoints, fanPoints, activeProfile.expected_first_crack_temp, activeProfile.expected_colour_change_temp]
  );
  const insight = useMemo(
    () => getOfficialProfileInsight({
      name: activeProfile.display_name ?? activeProfile.short_name,
      description: activeProfile.description,
      processFit: activeProfile.process_fit,
      expectedColourChangeTemp: activeProfile.expected_colour_change_temp,
      expectedFirstCrackTemp: activeProfile.expected_first_crack_temp,
      roastCurvePoints: tempPoints
    }),
    [activeProfile, tempPoints]
  );
  const endTemp = tempPoints.at(-1)?.value ?? null;
  const totalTime = Math.max(tempPoints.at(-1)?.timeSeconds ?? 0, fanPoints.at(-1)?.timeSeconds ?? 0);

  return (
    <section className="roast-stage" aria-label="动态烘焙曲线预览">
      <div className="roast-stage-header">
        <div>
          <div className="stage-kicker">
            <Activity size={14} />
            Live profile artifact
          </div>
          <h2>{activeProfile.display_name ?? activeProfile.short_name ?? "未命名曲线"}</h2>
          <p>{activeProfile.description || "导入参考曲线后，系统会在这里用真实温度曲线和风速曲线生成动态预览。"}</p>
        </div>
        <div className="stage-tags">
          <Tag color="green">{activeProfile.source_type ?? "uploaded"}</Tag>
          <Tag>{activeProfile.target_brew ?? "filter"}</Tag>
          <Tag>{activeProfile.process_fit ?? "any"}</Tag>
        </div>
      </div>

      <div className="roast-canvas">
        <svg viewBox="0 0 980 430" width="100%" height="100%" role="img" aria-label="温度与风速动态曲线">
          <defs>
            <linearGradient id={`${instanceId}-temp`} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#18b36a" />
              <stop offset="46%" stopColor="#e2b94e" />
              <stop offset="100%" stopColor="#f26735" />
            </linearGradient>
            <linearGradient id={`${instanceId}-fan`} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#7dd3fc" />
              <stop offset="100%" stopColor="#2563eb" />
            </linearGradient>
            <filter id={`${instanceId}-glow`} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <rect x="0" y="0" width="980" height="430" rx="18" fill="#0f1411" />
          <g opacity="0.42">
            {Array.from({ length: 7 }).map((_, index) => {
              const y = 72 + index * 48;
              return <line key={`h-${index}`} x1="58" x2="928" y1={y} y2={y} stroke="#253129" strokeWidth="1" />;
            })}
            {Array.from({ length: 9 }).map((_, index) => {
              const x = 58 + index * 108.75;
              return <line key={`v-${index}`} x1={x} x2={x} y1="48" y2="366" stroke="#1f2a24" strokeWidth="1" />;
            })}
          </g>

          <text x="58" y="38" fill="#8da595" fontSize="12" fontWeight="700">KAFFELOGIC PROFILE TRACE</text>
          <text x="830" y="38" fill="#8da595" fontSize="12" textAnchor="end">{formatTime(totalTime)}</text>

          {geometry.phaseBands.map((band) => (
            <g key={band.key}>
              <rect x={band.x} y="48" width={band.width} height="318" fill={band.fill} opacity="0.13" />
              <text x={band.x + 10} y="358" fill="#bfd1c5" fontSize="11" fontWeight="700">{band.label}</text>
            </g>
          ))}

          {geometry.tempPath ? (
            <>
              <path d={geometry.tempPath} fill="none" stroke="#1f2b23" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
              <path
                id={`${instanceId}-temp-path`}
                className="profile-draw temp-draw"
                d={geometry.tempPath}
                fill="none"
                stroke={`url(#${instanceId}-temp)`}
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
                filter={`url(#${instanceId}-glow)`}
              />
              <circle r="7" fill="#fff6d9" stroke="#f26735" strokeWidth="3">
                <animateMotion dur="7s" repeatCount="indefinite" rotate="auto">
                  <mpath href={`#${instanceId}-temp-path`} />
                </animateMotion>
              </circle>
            </>
          ) : (
            <text x="58" y="215" fill="#8da595">暂无温度曲线点</text>
          )}

          {geometry.fanPath ? (
            <>
              <path
                id={`${instanceId}-fan-path`}
                className="profile-draw fan-draw"
                d={geometry.fanPath}
                fill="none"
                stroke={`url(#${instanceId}-fan)`}
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.84"
              />
              <circle r="5" fill="#dbf7ff" stroke="#38bdf8" strokeWidth="2">
                <animateMotion dur="8.5s" repeatCount="indefinite" rotate="auto">
                  <mpath href={`#${instanceId}-fan-path`} />
                </animateMotion>
              </circle>
            </>
          ) : null}

          {geometry.colourChangeX ? (
            <g>
              <line x1={geometry.colourChangeX} x2={geometry.colourChangeX} y1="48" y2="366" stroke="#22c55e" strokeWidth="1.2" strokeDasharray="4 7" opacity="0.75" />
              <text x={geometry.colourChangeX + 8} y="68" fill="#b9f6ca" fontSize="12">Colour {formatRoastTime(insight.colourChangeSeconds)}</text>
            </g>
          ) : null}

          {geometry.firstCrackX ? (
            <g>
              <line x1={geometry.firstCrackX} x2={geometry.firstCrackX} y1="48" y2="366" stroke="#f59e0b" strokeWidth="1.2" strokeDasharray="6 8" opacity="0.85" />
              <text x={geometry.firstCrackX + 8} y="88" fill="#f8d687" fontSize="12">FC {formatRoastTime(insight.firstCrackSeconds)}</text>
            </g>
          ) : null}

          <g transform="translate(58 382)">
            <circle cx="0" cy="0" r="5" fill="#f26735" />
            <text x="14" y="4" fill="#dfe9df" fontSize="12">temperature profile</text>
            <circle cx="172" cy="0" r="5" fill="#38bdf8" />
            <text x="186" y="4" fill="#dfe9df" fontSize="12">fan profile</text>
          </g>
        </svg>
      </div>

      <div className="stage-metrics">
        <Metric icon={<Gauge size={18} />} label="Level" value={formatNumber(activeProfile.recommended_level, "N/A")} />
        <Metric icon={<Flame size={18} />} label="Expected FC" value={formatNumber(activeProfile.expected_first_crack_temp, "N/A", " C")} />
        <Metric icon={<TimerReset size={18} />} label="Duration" value={formatTime(totalTime)} />
        <Metric icon={<Fan size={18} />} label="End temp" value={formatNumber(endTemp, "N/A", " C")} />
        <Metric icon={<Activity size={18} />} label="DTR" value={insight.developmentRatio === null ? "N/A" : `${insight.developmentRatio.toFixed(1)}%`} />
      </div>
    </section>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="stage-metric">
      <span>{icon}</span>
      <div>
        <strong>{value}</strong>
        <small>{label}</small>
      </div>
    </div>
  );
}

function createGeometry(tempPoints: CurvePoint[], fanPoints: CurvePoint[], expectedFirstCrack: number | null, expectedColourChange: number | null) {
  const width = 980;
  const height = 430;
  const padding = { left: 58, right: 52, top: 48, bottom: 64 };
  const maxTime = Math.max(
    ...tempPoints.map((point) => point.timeSeconds),
    ...fanPoints.map((point) => point.timeSeconds),
    1
  );
  const tempValues = tempPoints.map((point) => point.value);
  const minTemp = Math.min(...tempValues, 20);
  const maxTemp = Math.max(...tempValues, 230);
  const tempPath = pointsToPath(tempPoints, maxTime, minTemp, maxTemp, width, height, padding);
  const fanPath = pointsToPath(fanPoints, maxTime, 9000, 16000, width, height, padding);
  const firstCrackSeconds = crossingTime(tempPoints, expectedFirstCrack);
  const colourChangeSeconds = crossingTime(tempPoints, expectedColourChange);
  const firstCrackX = firstCrackSeconds === null ? null : timeToX(firstCrackSeconds, maxTime, width, padding);
  const colourChangeX = colourChangeSeconds === null ? null : timeToX(colourChangeSeconds, maxTime, width, padding);
  const endX = width - padding.right;

  return {
    tempPath,
    fanPath,
    firstCrackY: expectedFirstCrack ? valueToY(expectedFirstCrack, minTemp, maxTemp, height, padding) : null,
    firstCrackX,
    colourChangeX,
    phaseBands: [
      { key: "drying", label: "Drying", x: padding.left, width: Math.max((colourChangeX ?? padding.left) - padding.left, 0), fill: "#18b36a" },
      { key: "maillard", label: "Maillard", x: colourChangeX ?? padding.left, width: Math.max((firstCrackX ?? endX) - (colourChangeX ?? padding.left), 0), fill: "#e2b94e" },
      { key: "development", label: "Development", x: firstCrackX ?? endX, width: Math.max(endX - (firstCrackX ?? endX), 0), fill: "#f26735" }
    ].filter((band) => band.width > 12)
  };
}

function pointsToPath(
  points: CurvePoint[],
  maxTime: number,
  minValue: number,
  maxValue: number,
  width: number,
  height: number,
  padding: { left: number; right: number; top: number; bottom: number }
) {
  if (!points.length) return "";
  const range = Math.max(maxValue - minValue, 1);
  return points
    .map((point, index) => {
      const x = padding.left + (point.timeSeconds / maxTime) * (width - padding.left - padding.right);
      const y = height - padding.bottom - ((point.value - minValue) / range) * (height - padding.top - padding.bottom);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

function valueToY(
  value: number,
  minValue: number,
  maxValue: number,
  height: number,
  padding: { top: number; bottom: number }
) {
  const range = Math.max(maxValue - minValue, 1);
  return height - padding.bottom - ((value - minValue) / range) * (height - padding.top - padding.bottom);
}

function timeToX(
  seconds: number,
  maxTime: number,
  width: number,
  padding: { left: number; right: number }
) {
  return padding.left + (seconds / Math.max(maxTime, 1)) * (width - padding.left - padding.right);
}

function crossingTime(points: CurvePoint[], target: number | null) {
  if (!target || points.length < 2) return null;
  const sorted = points.slice().sort((a, b) => a.timeSeconds - b.timeSeconds);
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if ((previous.value <= target && current.value >= target) || (previous.value >= target && current.value <= target)) {
      const span = current.value - previous.value;
      if (!span) return current.timeSeconds;
      return Math.round(previous.timeSeconds + ((target - previous.value) / span) * (current.timeSeconds - previous.timeSeconds));
    }
  }
  return null;
}

function formatTime(seconds: number) {
  if (!seconds) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

function formatNumber(value: number | null | undefined, fallback: string, suffix = "") {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return `${Number.isInteger(value) ? value : value.toFixed(1)}${suffix}`;
}
