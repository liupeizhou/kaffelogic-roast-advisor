import Link from "next/link";
import { Card, Col, Row, Space, Tag } from "antd";
import CurveChart from "@/components/curve-chart";
import { getDictionary, type Locale } from "@/lib/i18n";
import type { SharePageRecord } from "@/lib/roast-persistence";

export default function SharePageView({ locale, share }: { locale: Locale; share: SharePageRecord }) {
  const t = getDictionary(locale);
  const curve = share.curve_documents;
  if (!curve) return null;
  return (
    <div className={`share-shell share-${share.template}`}>
      <section className="share-hero">
        <Tag>{t.share[share.template]}</Tag>
        <h1>{share.title}</h1>
        <p>{share.summary}</p>
      </section>
      <Row gutter={[16, 16]} align="top">
        <Col xs={24} lg={15}>
          <Card>
            <CurveChart title="Temperature profile" points={curve.roast_curve_points} color="#f26735" unit=" C" />
            <DividerLite />
            <CurveChart title="Fan profile" points={curve.fan_curve_points} color="#38bdf8" />
          </Card>
        </Col>
        <Col xs={24} lg={9}>
          <Card title="AI prediction">
            <p>{share.ai_prediction}</p>
          </Card>
          <Card title="Philosophy">
            <blockquote>{share.quote_text}</blockquote>
            <p className="muted">{share.quote_author}{share.quote_work ? `, ${share.quote_work}` : ""}</p>
            <small className="muted">{share.quote_source_note}</small>
          </Card>
          <Card>
            <Space orientation="vertical" size={8}>
              <span>{curve.short_name ?? curve.title}</span>
              <span>Level {curve.recommended_level ?? "N/A"} · FC {curve.expected_first_crack_temp ?? "N/A"} C</span>
              <Link href={`/api/share-image/${share.slug}?template=${share.template}`}>{t.share.image}</Link>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

function DividerLite() {
  return <div className="share-divider" />;
}
