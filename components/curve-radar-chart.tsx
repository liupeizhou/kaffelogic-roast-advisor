"use client";

import type { CurveRadarMetric } from "@/lib/curve-radar";
import type { Locale } from "@/lib/i18n";

export type RadarSeries = {
  name: string;
  color: string;
  metrics: CurveRadarMetric[];
};

export default function CurveRadarChart({ locale, series }: { locale: Locale; series: RadarSeries[] }) {
  const size = 300;
  const center = size / 2;
  const radius = 108;
  const axes = series[0]?.metrics ?? [];
  if (!axes.length) return <div className="radar-empty">暂无雷达图数据</div>;

  return (
    <div className="radar-wrap">
      <svg viewBox={`0 0 ${size} ${size}`} className="radar-chart" role="img" aria-label="曲线雷达图">
        {[0.25, 0.5, 0.75, 1].map((level) => (
          <polygon
            key={level}
            points={axes.map((_, index) => polarPoint(index, axes.length, radius * level, center)).join(" ")}
            fill="none"
            stroke="#d8ddd7"
          />
        ))}
        {axes.map((axis, index) => {
          const [x, y] = polarPoint(index, axes.length, radius, center).split(",").map(Number);
          const label = locale === "zh" ? axis.labelZh : axis.labelEn;
          return (
            <g key={axis.key}>
              <line x1={center} y1={center} x2={x} y2={y} stroke="#d8ddd7" />
              <text x={x} y={y + (y > center ? 16 : -8)} textAnchor={x > center + 12 ? "start" : x < center - 12 ? "end" : "middle"} fill="#4d5c52" fontSize="11">
                {label}
              </text>
            </g>
          );
        })}
        {series.map((item) => {
          const points = item.metrics.map((metric, index) => polarPoint(index, item.metrics.length, radius * (metric.value / 100), center)).join(" ");
          return (
            <g key={item.name}>
              <polygon points={points} fill={item.color} fillOpacity="0.14" stroke={item.color} strokeWidth="2.5" />
              {item.metrics.map((metric, index) => {
                const [x, y] = polarPoint(index, item.metrics.length, radius * (metric.value / 100), center).split(",").map(Number);
                return <circle key={metric.key} cx={x} cy={y} r="3.5" fill={item.color} />;
              })}
            </g>
          );
        })}
      </svg>
      <div className="radar-legend">
        {series.map((item) => (
          <span key={item.name}><i style={{ background: item.color }} />{item.name}</span>
        ))}
      </div>
    </div>
  );
}

function polarPoint(index: number, total: number, radius: number, center: number) {
  const angle = -Math.PI / 2 + (index / total) * Math.PI * 2;
  const x = center + Math.cos(angle) * radius;
  const y = center + Math.sin(angle) * radius;
  return `${x.toFixed(1)},${y.toFixed(1)}`;
}
