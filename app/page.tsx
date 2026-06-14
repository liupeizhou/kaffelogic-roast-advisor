import Link from "next/link";
import { BarChart3, Database, Settings, UploadCloud } from "lucide-react";
import { Button, Card, Col, Row, Space, Statistic, Tag } from "antd";

export default function HomePage() {
  return (
    <div className="page">
      <section className="home-hero">
        <div className="hero-copy">
          <Space size={8} wrap>
            <Tag color="green">Kaffelogic Nano</Tag>
            <Tag>Ant Design Console</Tag>
          </Space>
          <h1>Roast profiles, logs and decisions in one precise bench.</h1>
          <p className="lede">
            上传 `.kpro` 曲线或 Kaffelogic log 图，解析曲线、识别关键节点、沉淀案例，再回到下一锅的推荐判断。
          </p>
          <Space size={12} wrap>
            <Link href="/upload">
              <Button type="primary" size="large" icon={<UploadCloud size={18} />}>上传分析</Button>
            </Link>
            <Link href="/admin/settings">
              <Button size="large" icon={<Settings size={18} />}>配置模型</Button>
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
        <Col xs={24} md={8}><Card><Statistic title="已验证 KPRO 结构" value={53} /></Card></Col>
        <Col xs={24} md={8}><Card><Statistic title="视觉读取 log 图" value="AI" /></Card></Col>
        <Col xs={24} md={8}><Card><Statistic title="Supabase 私有存储" value="RLS" /></Card></Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Link href="/recommend">
            <Card hoverable className="feature-card">
              <Space orientation="vertical" size={16}>
                <span className="icon-title"><BarChart3 size={22} />推荐顾问</span>
                <span className="muted">按处理法、产地、海拔、风味和目标烘焙度选择曲线。</span>
              </Space>
            </Card>
          </Link>
        </Col>
        <Col xs={24} md={8}>
          <Link href="/upload">
            <Card hoverable className="feature-card">
              <Space orientation="vertical" size={16}>
                <span className="icon-title"><UploadCloud size={22} />上传分析</span>
                <span className="muted">解析 `.kpro`，或分析 log 图片里的 FC、ROR、结束点和风险。</span>
              </Space>
            </Card>
          </Link>
        </Col>
        <Col xs={24} md={8}>
          <Link href="/library">
            <Card hoverable className="feature-card">
              <Space orientation="vertical" size={16}>
                <span className="icon-title"><Database size={22} />曲线/案例库</span>
                <span className="muted">沉淀上传曲线、成功案例、失败案例和通用操作知识。</span>
              </Space>
            </Card>
          </Link>
        </Col>
      </Row>
    </div>
  );
}
