"use client";

import { useState } from "react";
import { Alert, Button, Card, Form, Input, InputNumber, Select, Space } from "antd";
import type { Locale } from "@/lib/i18n";

export default function AdminUserGrants({ locale }: { locale: Locale }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(values: { userId: string; planCode?: string; credits?: number; note?: string }) {
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/admin/grants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values)
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Grant failed.");
      setMessage(locale === "zh" ? "授权已写入。" : "Grant saved.");
    } catch (grantError) {
      setError(grantError instanceof Error ? grantError.message : "Grant failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <Space orientation="vertical" size={14} className="full-width">
        {message ? <Alert type="success" showIcon message={message} /> : null}
        {error ? <Alert type="error" showIcon message={error} /> : null}
        <Form layout="vertical" onFinish={submit}>
          <Form.Item name="userId" label="Supabase user id" rules={[{ required: true }]}>
            <Input placeholder="uuid" />
          </Form.Item>
          <Form.Item name="planCode" label={locale === "zh" ? "套餐" : "Plan"}>
            <Select allowClear options={[
              { value: "free", label: locale === "zh" ? "普通用户组" : "Free users" },
              { value: "standard", label: locale === "zh" ? "标准订阅用户组 39.9 CNY/mo" : "Standard subscribers 39.9 CNY/mo" },
              { value: "premium", label: locale === "zh" ? "高级订阅用户组 199 CNY/mo" : "Premium subscribers 199 CNY/mo" }
            ]} />
          </Form.Item>
          <Form.Item name="credits" label={locale === "zh" ? "增加按量次数" : "Add credits"}>
            <InputNumber min={0} precision={0} className="full-width" />
          </Form.Item>
          <Form.Item name="note" label={locale === "zh" ? "备注" : "Note"}>
            <Input />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={loading}>
            {locale === "zh" ? "写入授权" : "Save grant"}
          </Button>
        </Form>
      </Space>
    </Card>
  );
}
