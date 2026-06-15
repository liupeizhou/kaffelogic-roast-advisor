import { ImageResponse } from "next/og";
import { getSharePage } from "@/lib/roast-persistence";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { searchParams } = new URL(request.url);
  const share = await getSharePage(slug);
  if (!share || !share.curve_documents) return new Response("Not found", { status: 404 });
  const template = searchParams.get("template") || share.template;
  const curve = share.curve_documents;
  const tempPath = toPath(curve.roast_curve_points, 1040, 360, 20, 240);
  return new ImageResponse(
    (
      <div style={{
        width: "1200px",
        height: "2000px",
        display: "flex",
        flexDirection: "column",
        padding: "80px",
        gap: "44px",
        background: backgroundFor(template),
        color: colorFor(template),
        fontFamily: "Arial"
      }}>
        <div style={{ fontSize: 28, letterSpacing: 4, textTransform: "uppercase" }}>Kaffelogic Profile</div>
        <div style={{ fontSize: 86, fontWeight: 800, lineHeight: 1.02 }}>{share.title}</div>
        <div style={{ fontSize: 34, lineHeight: 1.35, opacity: 0.86 }}>{share.summary}</div>
        <svg width="1040" height="460" viewBox="0 0 1040 460">
          <rect x="0" y="0" width="1040" height="460" rx="30" fill={panelFor(template)} />
          {tempPath ? (
            <path d={tempPath} fill="none" stroke={accentFor(template)} strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            <text x="80" y="240" fill={accentFor(template)} fontSize="34">No temperature curve points</text>
          )}
        </svg>
        <div style={{ display: "flex", gap: "24px" }}>
          <Metric label="Level" value={String(curve.recommended_level ?? "N/A")} />
          <Metric label="Expected FC" value={`${curve.expected_first_crack_temp ?? "N/A"} C`} />
          <Metric label="Points" value={`${curve.roast_curve_points.length}/${curve.fan_curve_points.length}`} />
        </div>
        <div style={{ fontSize: 38, lineHeight: 1.35 }}>{share.ai_prediction}</div>
        <div style={{ marginTop: "auto", borderTop: `2px solid ${accentFor(template)}`, paddingTop: "36px" }}>
          <div style={{ fontSize: 42, lineHeight: 1.25 }}>{`"${share.quote_text}"`}</div>
          <div style={{ fontSize: 26, marginTop: "18px", opacity: 0.78 }}>{share.quote_author}{share.quote_work ? `, ${share.quote_work}` : ""}</div>
        </div>
      </div>
    ),
    { width: 1200, height: 2000 }
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "24px", border: "2px solid rgba(255,255,255,.24)", borderRadius: "18px", width: "32%" }}>
      <div style={{ fontSize: 24, opacity: 0.72 }}>{label}</div>
      <div style={{ fontSize: 44, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function toPath(points: Array<{ timeSeconds: number; value: number }>, width: number, height: number, minValue: number, maxValue: number) {
  if (!points.length) return "";
  const maxTime = Math.max(...points.map((point) => point.timeSeconds), 1);
  return points.map((point, index) => {
    const x = 50 + (point.timeSeconds / maxTime) * (width - 100);
    const y = height - 50 - ((point.value - minValue) / Math.max(maxValue - minValue, 1)) * (height - 100);
    return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
}

function backgroundFor(template: string) {
  if (template === "baroque") return "linear-gradient(135deg,#130d08,#38220f)";
  if (template === "cyberpunk") return "linear-gradient(135deg,#070816,#161a3d)";
  return "#122016";
}

function panelFor(template: string) {
  if (template === "baroque") return "#251407";
  if (template === "cyberpunk") return "#090d26";
  return "#0f1712";
}

function accentFor(template: string) {
  if (template === "baroque") return "#d9a441";
  if (template === "cyberpunk") return "#30f2ff";
  return "#f26735";
}

function colorFor(template: string) {
  if (template === "cyberpunk") return "#e8fbff";
  return "#fff8ea";
}
