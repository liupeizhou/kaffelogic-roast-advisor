import { Card, Col, Row, Space, Tag } from "antd";
import { ArrowRight, Coffee, SlidersHorizontal } from "lucide-react";
import OfficialProfileGuide from "@/components/official-profile-guide";
import { getDictionary, normalizeLocale } from "@/lib/i18n";
import { officialProfileFamilies } from "@/lib/kaffelogic-official";

export default async function RecommendPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const normalizedLocale = normalizeLocale(locale);
  const t = getDictionary(normalizedLocale);
  const zh = normalizedLocale === "zh";
  return (
    <div className="page wide-page">
      <section className="page-header">
        <p className="eyebrow">{t.nav.recommend}</p>
        <h1>{zh ? "用官方 profile 逻辑约束推荐，不让模型乱猜曲线。" : "Constrain recommendations with official profile logic before asking the model to reason."}</h1>
        <p className="lede">
          {zh
            ? "先判断处理法、养豆计划、杯测目的和深浅偏好，再引用资料库曲线与已确认案例。AI 只负责解释和排序，不替代真实 profile 数据。"
            : "Start with processing method, resting plan, cupping intent and roast depth, then cite library profiles and confirmed cases. AI explains and ranks; it does not replace real profile data."}
        </p>
      </section>

      <OfficialProfileGuide locale={normalizedLocale} />

      <Row gutter={[16, 16]} className="recommend-flow">
        <Col xs={24} lg={8}>
          <Card>
            <Space orientation="vertical" size={12}>
              <span className="icon-title"><Coffee size={18} />{zh ? "1. 先匹配豆子意图" : "1. Match coffee intent"}</span>
              <p>{zh ? "水洗/日晒优先进入 KL Washed 或 KL Natural；低因、Robusta、Super Dark、Cupping 不应混作普通曲线。" : "Washed and natural coffees should start with KL Washed or KL Natural. Decaf, Robusta, Super Dark and Cupping should not be treated as generic profiles."}</p>
            </Space>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card>
            <Space orientation="vertical" size={12}>
              <span className="icon-title"><SlidersHorizontal size={18} />{zh ? "2. 再决定调哪里" : "2. Decide what to adjust"}</span>
              <p>{zh ? "只是偏浅/偏深，调 level；风味方向不对，换 profile；曲线跟随异常，再看 bean curve / fan curve。" : "If it is only light or dark, adjust level. If the flavor direction is wrong, switch profile. If tracking is abnormal, inspect bean and fan curves."}</p>
            </Space>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card>
            <Space orientation="vertical" size={12}>
              <span className="icon-title"><ArrowRight size={18} />{zh ? "3. 用 log 关闭循环" : "3. Close the loop with logs"}</span>
              <p>{zh ? "记录转黄、一爆、DTR、结束点和杯测反馈。下一次推荐必须引用这些已确认案例，而不是只看生豆描述。" : "Record color change, first crack, DTR, end point and tasting feedback. The next recommendation should cite confirmed cases, not only green coffee descriptors."}</p>
            </Space>
          </Card>
        </Col>
      </Row>

      <Card className="recommend-matrix-card" title={zh ? "核心 profile 选择矩阵" : "Core profile selection matrix"}>
        <div className="recommend-matrix">
          {officialProfileFamilies.map((family) => (
            <div key={family.key}>
              <strong>{family.name}</strong>
              <span>{zh ? family.intentZh : family.intentEn}</span>
              <Space size={6} wrap>
                {(zh ? family.bestForZh : family.bestForEn).slice(0, 3).map((item) => <Tag key={item}>{item}</Tag>)}
              </Space>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
