import { Card, Col, Row, Space, Tag } from "antd";
import { BookOpen, GitBranch, SlidersHorizontal, TimerReset } from "lucide-react";
import {
  formatRoastTime,
  getOfficialProfileInsight,
  officialPhaseNotes,
  officialProfileFamilies,
  type OfficialProfileInsight
} from "@/lib/kaffelogic-official";
import type { CurvePoint } from "@/lib/types";
import type { Locale } from "@/lib/i18n";

type OfficialProfileGuideProps = {
  locale: Locale;
  compact?: boolean;
  profile?: {
    name?: string | null;
    description?: string | null;
    processFit?: string | null;
    expectedColourChangeTemp?: number | null;
    expectedFirstCrackTemp?: number | null;
    roastCurvePoints?: CurvePoint[] | null;
  } | null;
};

export default function OfficialProfileGuide({ locale, compact = false, profile }: OfficialProfileGuideProps) {
  const insight = getOfficialProfileInsight(profile ?? {});
  const zh = locale === "zh";

  return (
    <Space orientation="vertical" size={16} className="full-width">
      <Card className="official-guide-card">
        <div className="official-guide-head">
          <div>
            <Tag color="green">{zh ? "官方 Profiles 逻辑" : "Official profile logic"}</Tag>
            <h2>{zh ? "先选 profile 风格，再用 level 校正深浅。" : "Choose the profile style first, then tune depth with level."}</h2>
            <p>
              {zh
                ? "Kaffelogic 官方说明把 profile 定义为时间-温度配方，并强调 log、阶段和 DTR 是下一锅调整的依据。"
                : "Kaffelogic describes a profile as a time-temperature recipe, with logs, roast phases and DTR informing the next adjustment."}
            </p>
          </div>
          <div className="guide-source-note">
            {zh ? "来源：Kaffelogic Profiles 官方页面" : "Source: Kaffelogic Profiles page"}
          </div>
        </div>

        <Row gutter={[12, 12]}>
          {officialPhaseNotes.map((phase) => (
            <Col xs={24} md={8} key={phase.key}>
              <div className="phase-note">
                <TimerReset size={17} />
                <strong>{zh ? phase.titleZh : phase.titleEn}</strong>
                <span>{zh ? phase.textZh : phase.textEn}</span>
              </div>
            </Col>
          ))}
        </Row>
      </Card>

      {profile ? <SelectedProfileInsight locale={locale} insight={insight} /> : null}

      {!compact ? (
        <Row gutter={[12, 12]}>
          {officialProfileFamilies.map((family) => (
            <Col xs={24} md={12} xl={8} key={family.key}>
              <Card className="profile-family-card" size="small">
                <Space orientation="vertical" size={10} className="full-width">
                  <span className="icon-title"><BookOpen size={17} />{family.name}</span>
                  <p>{zh ? family.intentZh : family.intentEn}</p>
                  <div className="family-tags">
                    {(zh ? family.bestForZh : family.bestForEn).map((item) => <Tag key={item}>{item}</Tag>)}
                  </div>
                  <small>{zh ? family.cautionZh : family.cautionEn}</small>
                </Space>
              </Card>
            </Col>
          ))}
        </Row>
      ) : null}
    </Space>
  );
}

function SelectedProfileInsight({ locale, insight }: { locale: Locale; insight: OfficialProfileInsight }) {
  const zh = locale === "zh";
  return (
    <Card className="profile-insight-card" size="small">
      <Row gutter={[12, 12]} align="middle">
        <Col xs={24} lg={8}>
          <span className="icon-title"><GitBranch size={17} />{zh ? "识别到的官方家族" : "Detected family"}</span>
          <h3>{insight.family?.name ?? (zh ? "未识别" : "Unknown")}</h3>
          <p>{insight.family ? (zh ? insight.family.intentZh : insight.family.intentEn) : (zh ? "可继续依赖 .kpro 说明和 log 案例判断适用范围。" : "Use the .kpro notes and log cases to judge fit.")}</p>
        </Col>
        <Col xs={24} lg={8}>
          <span className="icon-title"><TimerReset size={17} />DTR</span>
          <h3>{insight.developmentRatio === null ? "N/A" : `${insight.developmentRatio.toFixed(1)}%`}</h3>
          <p>
            {zh ? "估算 FC " : "Estimated FC "}
            {formatRoastTime(insight.firstCrackSeconds)}
            {zh ? "，转黄 " : ", color change "}
            {formatRoastTime(insight.colourChangeSeconds)}
          </p>
        </Col>
        <Col xs={24} lg={8}>
          <span className="icon-title"><SlidersHorizontal size={17} />{zh ? "调整原则" : "Adjustment rule"}</span>
          <p>{zh ? insight.levelAdviceZh : insight.levelAdviceEn}</p>
          <p>{zh ? insight.profileAdviceZh : insight.profileAdviceEn}</p>
        </Col>
      </Row>
      {insight.phaseMetrics.length ? (
        <div className="phase-bars">
          {insight.phaseMetrics.map((phase) => (
            <div key={phase.key} style={{ width: `${Math.max(phase.ratio ?? 0, 8)}%` }}>
              <strong>{zh ? phase.labelZh : phase.labelEn}</strong>
              <span>{phase.ratio === null ? "N/A" : `${phase.ratio.toFixed(0)}%`}</span>
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
