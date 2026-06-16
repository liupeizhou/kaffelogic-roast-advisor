"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, Button, Card, Form, Input, Space } from "antd";
import { Mail, ShieldCheck } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getDictionary, withLocale, type Locale } from "@/lib/i18n";

export default function EmailOtpLogin({ locale }: { locale: Locale }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = getDictionary(locale);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(t.login.invalid);
      return;
    }
    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: true
        }
      });
      if (signInError) throw signInError;
      setSent(true);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Failed to send code.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode() {
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || !/^\d{6}$/.test(code.trim())) {
      setError(t.login.invalid);
      return;
    }
    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code.trim(),
        type: "email"
      });
      if (verifyError) throw verifyError;
      const next = searchParams.get("next");
      router.push(next && next.startsWith("/") ? next : withLocale(locale, "/account"));
      router.refresh();
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : "Failed to verify code.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="auth-card">
      <Form layout="vertical" onFinish={sent ? verifyCode : sendCode}>
        <Form.Item label={t.login.email}>
          <Input
            size="large"
            prefix={<Mail size={16} />}
            value={email}
            disabled={sent || loading}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </Form.Item>
        {sent ? (
          <Form.Item label={t.login.code}>
            <Input
              size="large"
              prefix={<ShieldCheck size={16} />}
              value={code}
              maxLength={6}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              placeholder="123456"
            />
          </Form.Item>
        ) : null}
        <Space orientation="vertical" size={12} className="full-width">
          {sent ? <Alert type="success" showIcon message={t.login.sent} /> : null}
          {error ? <Alert type="error" showIcon message={error} /> : null}
          <Button block type="primary" size="large" htmlType="submit" loading={loading}>
            {sent ? t.login.verify : t.login.send}
          </Button>
          {sent ? (
            <Button block onClick={() => {
              setSent(false);
              setCode("");
              setError(null);
            }}>
              {locale === "zh" ? "换一个邮箱" : "Use another email"}
            </Button>
          ) : null}
        </Space>
      </Form>
    </Card>
  );
}
