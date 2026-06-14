"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Card, Form, Input, InputNumber, Select, Space } from "antd";
import { adminHeaders, getStoredAdminToken, setStoredAdminToken } from "@/lib/admin-client";
import type { Locale } from "@/lib/i18n";

export default function AdminUserGrants({ locale }: { locale: Locale }) {
  const [adminToken, setAdminToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAdminToken(getStoredAdminToken());
  }, []);

  async function submit(values: { userId: string; planCode?: string; credits?: number; note?: string }) {
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/admin/grants", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...adminHeaders(adminToken) },
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
      <Space direction="vertical" size={14} className="full-width">
        {message ? <Alert type="success" showIcon message={message} /> : null}
        {error ? <Alert type="error" showIcon message={error} /> : null}
        <Input.Password
          value={adminToken}
          onChange={(event) => {
            setAdminToken(event.target.value);
            setStoredAdminToken(event.target.value);
          }}
          placeholder="Admin Access Token"
        />
        <Form layout="vertical" onFinish={submit}>
          <Form.Item name="userId" label="Supabase user id" rules={[{ required: true }]}>
            <Input placeholder="uuid" />
          </Form.Item>
          <Form.Item name="planCode" label={locale === "zh" ? "套餐" : "Plan"}>
            <Select allowClear options={[
              { value: "free", label: "Free" },
              { value: "balanced", label: "Balanced 39.9 CNY/mo" },
              { value: "pro", label: "Pro 199 CNY/mo" }
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
