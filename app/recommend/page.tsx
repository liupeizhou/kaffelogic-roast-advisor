import { BarChart3 } from "lucide-react";
import { Card, Col, Result, Row, Tag } from "antd";

export default function RecommendPage() {
  return (
    <div className="page">
      <section className="page-header compact-header">
        <Tag color="green">推荐顾问</Tag>
        <h1>推荐逻辑入口已预留。</h1>
        <p className="lede">
          上传曲线和确认案例后，这里会按处理法、海拔、目标冲煮、含水率、密度和相似成功案例生成 Top 3 曲线建议。
        </p>
      </section>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card title={<span className="card-title"><BarChart3 size={20} />v1 推荐联动</span>}>
            <ul className="list">
              <li>新上传 `.kpro` 进入曲线库后参与筛选。</li>
              <li>已确认 log 案例进入相似案例引用。</li>
              <li>AI 解析结果未确认前只作为低置信参考。</li>
            </ul>
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Result
            status="info"
            title="等待曲线库数据"
            subTitle="完成上传分析和 Supabase 配置后，这里会显示可解释推荐。"
          />
        </Col>
      </Row>
    </div>
  );
}
