import Link from "next/link";
import { BarChart3, Database, UploadCloud } from "lucide-react";
import { Button, Card, Col, Row, Space, Statistic, Tag } from "antd";
import { getDictionary, withLocale, type Locale } from "@/lib/i18n";

export default function LocalizedHomePage({ locale }: { locale: Locale }) {
  const t = getDictionary(locale);
  return (
    <div className="page">
      <section className="home-hero">
        <div className="hero-copy">
          <Space size={8} wrap>
            <Tag color="green">Kaffelogic Nano</Tag>
            <Tag>Ant Design Console</Tag>
          </Space>
          <h1>{t.home.title}</h1>
          <p className="lede">{t.home.lede}</p>
          <Space size={12} wrap>
            <Link href={withLocale(locale, "/upload")}>
              <Button type="primary" size="large" icon={<UploadCloud size={18} />}>{t.actions.upload}</Button>
            </Link>
          </Space>
        </div>
        <Card className="machine-panel-card" styles={{ body: { padding: 0 } }}>
          <div className="machine-panel" aria-label="Kaffelogic roast dashboard preview">
            <div className="machine-top">
              <span>Nano 7</span>
              <span>PROFILE: KL NATURAL</span>
            </div>
            <div className="machine-display">
              <div><span className="display-label">FC</span><strong>6:44</strong></div>
              <div><span className="display-label">END</span><strong>7:47</strong></div>
              <div><span className="display-label">DEV</span><strong>13.4%</strong></div>
            </div>
            <div className="mini-chart">
              <span style={{ height: "30%" }} />
              <span style={{ height: "44%" }} />
              <span style={{ height: "58%" }} />
              <span style={{ height: "67%" }} />
              <span style={{ height: "76%" }} />
              <span style={{ height: "82%" }} />
              <span style={{ height: "86%" }} />
            </div>
            <div className="machine-controls"><span /><span /><span /></div>
          </div>
        </Card>
      </section>

      <Row gutter={[16, 16]} className="metric-row">
        <Col xs={24} md={8}><Card><Statistic title={locale === "zh" ? "已验证 KPRO 结构" : "Verified KPRO structures"} value={53} /></Card></Col>
        <Col xs={24} md={8}><Card><Statistic title={locale === "zh" ? "视觉读取 log 图" : "Vision log reading"} value="AI" /></Card></Col>
        <Col xs={24} md={8}><Card><Statistic title={locale === "zh" ? "用户额度账本" : "User quota ledger"} value="GMT+8" /></Card></Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Feature href={withLocale(locale, "/recommend")} icon={<BarChart3 size={22} />} title={t.nav.recommend} text={t.home.cards.recommend} />
        <Feature href={withLocale(locale, "/upload")} icon={<UploadCloud size={22} />} title={t.nav.upload} text={t.home.cards.upload} />
        <Feature href={withLocale(locale, "/library")} icon={<Database size={22} />} title={t.nav.library} text={t.home.cards.library} />
      </Row>
    </div>
  );
}

function Feature({ href, icon, title, text }: { href: string; icon: React.ReactNode; title: string; text: string }) {
  return (
    <Col xs={24} md={8}>
      <Link href={href}>
        <Card hoverable className="feature-card">
          <Space orientation="vertical" size={16}>
            <span className="icon-title">{icon}{title}</span>
            <span className="muted">{text}</span>
          </Space>
        </Card>
      </Link>
    </Col>
  );
}
