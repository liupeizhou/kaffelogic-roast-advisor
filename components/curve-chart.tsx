"use client";

import type { CurvePoint } from "@/lib/types";

type CurveChartProps = {
  title: string;
  points: CurvePoint[];
  color?: string;
  unit?: string;
};

export default function CurveChart({ title, points, color = "#0f766e", unit = "" }: CurveChartProps) {
  const width = 720;
  const height = 260;
  const padding = 34;
  const maxTime = Math.max(...points.map((point) => point.timeSeconds), 1);
  const maxValue = Math.max(...points.map((point) => point.value), 1);
  const minValue = Math.min(...points.map((point) => point.value), 0);
  const valueRange = Math.max(maxValue - minValue, 1);

  const path = points
    .map((point, index) => {
      const x = padding + (point.timeSeconds / maxTime) * (width - padding * 2);
      const y = height - padding - ((point.value - minValue) / valueRange) * (height - padding * 2);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  if (!points.length) {
    return (
      <div className="chart" role="img" aria-label={`${title} 无可用曲线点`}>
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%">
          <text x="24" y="38" fill="#67726b">{title}</text>
          <text x="24" y="72" fill="#67726b">没有可绘制的数据点</text>
        </svg>
      </div>
    );
  }

  return (
    <div className="chart" role="img" aria-label={title}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%">
        <text x="24" y="28" fill="#1c2520" fontWeight="700">{title}</text>
        {[0, 1, 2, 3].map((tick) => {
          const y = padding + tick * ((height - padding * 2) / 3);
          return <line key={tick} x1={padding} x2={width - padding} y1={y} y2={y} stroke="#d8ddd7" strokeWidth="1" />;
        })}
        <path d={path} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        <text x={padding} y={height - 10} fill="#67726b" fontSize="12">0:00</text>
        <text x={width - padding - 58} y={height - 10} fill="#67726b" fontSize="12">{formatTime(maxTime)}</text>
        <text x={width - padding - 90} y="28" fill="#67726b" fontSize="12">
          {Math.round(maxValue)}{unit}
        </text>
      </svg>
    </div>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}
