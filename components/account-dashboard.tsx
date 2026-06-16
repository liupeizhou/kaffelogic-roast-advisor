"use client";

import { useEffect, useState } from "react";
import { Alert, Card, Col, Row, Space, Statistic, Tag } from "antd";
import type { QuotaSnapshot } from "@/lib/quota";
import { getDictionary, type Locale } from "@/lib/i18n";

type AccountResponse = {
  user?: { id: string; email?: string };
  quotaSnapshot?: QuotaSnapshot;
  error?: string;
};

export default function AccountDashboard({ locale }: { locale: Locale }) {
  const t = getDictionary(locale);
  const [payload, setPayload] = useState<AccountResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/account/quota", { cache: "no-store" })
      .then(async (response) => {
        const nextPayload = await response.json() as AccountResponse;
        if (!response.ok) throw new Error(nextPayload.error ?? "Failed to load quota.");
        setPayload(nextPayload);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Failed to load quota."));
  }, []);

  const quota = payload?.quotaSnapshot;
  const groupLabel = quota ? getGroupLabel(quota.userGroup, locale) : null;
  return (
    <Space orientation="vertical" size={16} className="full-width">
      {error ? <Alert type="warning" showIcon message={error} /> : null}
      <Card>
        <Space size={10} wrap>
          <Tag color="green">{payload?.user?.email ?? "Supabase user"}</Tag>
          {groupLabel ? <Tag color={quota?.userGroup === "management" ? "gold" : "blue"}>{groupLabel}</Tag> : null}
          {quota ? <Tag>{quota.planCode}</Tag> : null}
          {quota ? <Tag>GMT+8 {quota.usageDay}</Tag> : null}
        </Space>
      </Card>
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card><Statistic title={t.quota.today} value={quota?.dailyRemaining ?? "-"} suffix={quota ? `/ ${quota.dailyLimit}` : ""} /></Card>
        </Col>
        <Col xs={24} md={8}>
          <Card><Statistic title={t.quota.month} value={quota?.monthlyRemaining ?? "-"} suffix={quota ? `/ ${quota.monthlyLimit}` : ""} /></Card>
        </Col>
        <Col xs={24} md={8}>
          <Card><Statistic title={t.quota.credits} value={quota?.creditBalance ?? "-"} /></Card>
        </Col>
      </Row>
      <Card title={locale === "zh" ? "套餐规则" : "Plan Rules"}>
        <div className="plan-grid">
          <Plan name={locale === "zh" ? "免费" : "Free"} price="0" quota={locale === "zh" ? "每日 3 次" : "3/day"} />
          <Plan name={locale === "zh" ? "平衡套餐" : "Balanced"} price="39.9 CNY/mo" quota={locale === "zh" ? "每日 10 / 每月 300" : "10/day / 300/month"} />
          <Plan name={locale === "zh" ? "按量包" : "Pay as you go"} price="0.29 CNY" quota={locale === "zh" ? "每次分析" : "per analysis"} />
          <Plan name={locale === "zh" ? "高阶套餐" : "Pro"} price="199 CNY/mo" quota={locale === "zh" ? "每日 100 / 每月 3000" : "100/day / 3000/month"} />
        </div>
      </Card>
    </Space>
  );
}

function Plan({ name, price, quota }: { name: string; price: string; quota: string }) {
  return (
    <div className="plan-tile">
      <strong>{name}</strong>
      <span>{price}</span>
      <small>{quota}</small>
    </div>
  );
}

function getGroupLabel(group: QuotaSnapshot["userGroup"], locale: Locale) {
  const labels = {
    management: locale === "zh" ? "管理组" : "Management",
    premium: locale === "zh" ? "高级订阅用户组" : "Premium subscribers",
    standard: locale === "zh" ? "标准订阅用户组" : "Standard subscribers",
    free: locale === "zh" ? "普通用户组" : "Free users"
  };
  return labels[group];
}
