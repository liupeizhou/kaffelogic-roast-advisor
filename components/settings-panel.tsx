"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, KeyRound, Save, ServerCog } from "lucide-react";
import { Alert, Button, Card, Col, Input, Row, Select, Space } from "antd";
import { adminHeaders, getStoredAdminToken, setStoredAdminToken } from "@/lib/admin-client";
import type { PublicRuntimeConfig } from "@/lib/runtime-config";

const SILICONFLOW_VISION_MODELS = [
  "Qwen/Qwen2.5-VL-72B-Instruct",
  "Qwen/Qwen2.5-VL-32B-Instruct",
  "deepseek-ai/deepseek-vl2",
  "THUDM/GLM-4.1V-9B-Thinking"
];

const SILICONFLOW_TEXT_MODELS = [
  "Qwen/Qwen3-32B",
  "Qwen/Qwen3-14B",
  "deepseek-ai/DeepSeek-V3.1"
];

const OPENAI_VISION_MODELS = [
  "gpt-4.1-mini",
  "gpt-4.1",
  "gpt-4o-mini",
  "gpt-4o"
];

const OPENAI_TEXT_MODELS = [
  "gpt-4.1-mini",
  "gpt-4.1",
  "gpt-4o-mini"
];

type FormState = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  supabaseUploadBucket: string;
  aiProvider: "openai" | "siliconflow" | "custom";
  aiBaseUrl: string;
  aiApiKey: string;
  aiTextModel: string;
  aiVisionModel: string;
};

export default function SettingsPanel() {
  const [form, setForm] = useState<FormState>({
    supabaseUrl: "",
    supabaseAnonKey: "",
    supabaseServiceRoleKey: "",
    supabaseUploadBucket: "kaffelogic-uploads",
    aiProvider: "siliconflow",
    aiBaseUrl: "https://api.siliconflow.cn/v1",
    aiApiKey: "",
    aiTextModel: "Qwen/Qwen3-32B",
    aiVisionModel: "Qwen/Qwen2.5-VL-72B-Instruct"
  });
  const [current, setCurrent] = useState<PublicRuntimeConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adminToken, setAdminToken] = useState("");

  useEffect(() => {
    const storedToken = getStoredAdminToken();
    setAdminToken(storedToken);
    fetch("/api/settings", { headers: adminHeaders(storedToken) })
      .then((response) => response.json())
      .then((config: PublicRuntimeConfig) => {
        setCurrent(config);
        setForm((previous) => ({
          ...previous,
          supabaseUrl: config.supabaseUrl,
          supabaseUploadBucket: config.supabaseUploadBucket,
          aiProvider: config.aiProvider,
          aiBaseUrl: config.aiBaseUrl,
          aiTextModel: config.aiTextModel,
          aiVisionModel: config.aiVisionModel
        }));
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "读取配置失败。"))
      .finally(() => setLoading(false));
  }, []);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((previous) => {
      const next = { ...previous, [key]: value };
      if (key === "aiProvider") {
        if (value === "siliconflow") {
          next.aiBaseUrl = "https://api.siliconflow.cn/v1";
          next.aiTextModel = SILICONFLOW_TEXT_MODELS[0];
          next.aiVisionModel = SILICONFLOW_VISION_MODELS[0];
        } else if (value === "openai") {
          next.aiBaseUrl = "https://api.openai.com/v1";
          next.aiTextModel = OPENAI_TEXT_MODELS[0];
          next.aiVisionModel = OPENAI_VISION_MODELS[0];
        }
      }
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    setError(null);
    setStoredAdminToken(adminToken);

    const response = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...adminHeaders(adminToken) },
      body: JSON.stringify(form)
    });

    const payload = await response.json();
    setSaving(false);

    if (!response.ok) {
      setError(payload.error ?? "保存配置失败。");
      return;
    }

    setCurrent(payload);
    setForm((previous) => ({ ...previous, supabaseAnonKey: "", supabaseServiceRoleKey: "", aiApiKey: "" }));
    setMessage("配置已保存到 .env.local。");
  }

  const visionModelOptions = form.aiProvider === "siliconflow" ? SILICONFLOW_VISION_MODELS : form.aiProvider === "openai" ? OPENAI_VISION_MODELS : [];
  const textModelOptions = form.aiProvider === "siliconflow" ? SILICONFLOW_TEXT_MODELS : form.aiProvider === "openai" ? OPENAI_TEXT_MODELS : [];

  if (loading) {
    return <Card loading />;
  }

  return (
    <Row gutter={[16, 16]} align="top">
      <Col xs={24} lg={16}>
        <Space orientation="vertical" size={16} className="full-width">
          <Card title={<span className="card-title"><ServerCog size={20} />Supabase</span>}>
            <Row gutter={[16, 16]}>
              <Col xs={24}>
                <Field label="Admin Access Token（公开部署后写操作必需）">
                  <Input.Password value={adminToken} onChange={(event) => setAdminToken(event.target.value)} placeholder="与 Vercel 环境变量 ADMIN_ACCESS_TOKEN 保持一致" />
                </Field>
              </Col>
              <Col xs={24} md={12}>
                <Field label="Project URL">
                  <Input value={form.supabaseUrl} onChange={(event) => update("supabaseUrl", event.target.value)} placeholder="https://xxxx.supabase.co" />
                </Field>
              </Col>
              <Col xs={24} md={12}>
                <Field label="Storage Bucket">
                  <Input value={form.supabaseUploadBucket} onChange={(event) => update("supabaseUploadBucket", event.target.value)} placeholder="kaffelogic-uploads" />
                </Field>
              </Col>
              <Col xs={24} md={12}>
                <Field label="Anon / Publishable Key（可选）">
                  <Input.Password value={form.supabaseAnonKey} onChange={(event) => update("supabaseAnonKey", event.target.value)} placeholder={current?.supabaseAnonKeySet ? "已配置，留空则保留" : "eyJ..."} />
                </Field>
              </Col>
              <Col xs={24} md={12}>
                <Field label="Service Role Key（服务端保存必需）">
                  <Input.Password value={form.supabaseServiceRoleKey} onChange={(event) => update("supabaseServiceRoleKey", event.target.value)} placeholder={current?.supabaseServiceRoleKeySet ? "已配置，留空则保留" : "eyJ..."} />
                </Field>
              </Col>
            </Row>
          </Card>

          <Card title={<span className="card-title"><KeyRound size={20} />AI 模型</span>}>
            <Row gutter={[16, 16]}>
              <Col xs={24} md={12}>
                <Field label="Provider">
                  <Select
                    className="full-width"
                    value={form.aiProvider}
                    onChange={(value) => update("aiProvider", value)}
                    options={[
                      { value: "siliconflow", label: "SiliconFlow" },
                      { value: "openai", label: "OpenAI" },
                      { value: "custom", label: "OpenAI-compatible Custom" }
                    ]}
                  />
                </Field>
              </Col>
              <Col xs={24} md={12}>
                <Field label="Base URL">
                  <Input value={form.aiBaseUrl} onChange={(event) => update("aiBaseUrl", event.target.value)} placeholder="https://api.siliconflow.cn/v1" />
                </Field>
              </Col>
              <Col xs={24} md={12}>
                <Field label="API Key">
                  <Input.Password value={form.aiApiKey} onChange={(event) => update("aiApiKey", event.target.value)} placeholder={current?.aiApiKeySet ? "已配置，留空则保留" : "sk-..."} />
                </Field>
              </Col>
              <Col xs={24} md={12}>
                <Field label="Text Model（分享文案）">
                  {textModelOptions.length ? (
                    <Select
                      className="full-width"
                      value={form.aiTextModel}
                      onChange={(value) => update("aiTextModel", value)}
                      options={textModelOptions.map((model) => ({ value: model, label: model }))}
                    />
                  ) : (
                    <Input value={form.aiTextModel} onChange={(event) => update("aiTextModel", event.target.value)} placeholder="provider/text-model-name" />
                  )}
                </Field>
              </Col>
              <Col xs={24} md={12}>
                <Field label="Vision Model（log 图片）">
                  {visionModelOptions.length ? (
                    <Select
                      className="full-width"
                      value={form.aiVisionModel}
                      onChange={(value) => update("aiVisionModel", value)}
                      options={visionModelOptions.map((model) => ({ value: model, label: model }))}
                    />
                  ) : (
                    <Input value={form.aiVisionModel} onChange={(event) => update("aiVisionModel", event.target.value)} placeholder="provider/vision-model-name" />
                  )}
                </Field>
              </Col>
            </Row>
          </Card>

          <Space size={12} wrap>
            <Button type="primary" icon={<Save size={18} />} onClick={save} loading={saving}>
              保存配置
            </Button>
            {message ? <Alert type="success" showIcon icon={<CheckCircle2 size={16} />} message={message} /> : null}
            {error ? <Alert type="error" showIcon message={error} /> : null}
          </Space>
        </Space>
      </Col>

      <Col xs={24} lg={8}>
        <Card title="配置说明">
          <Space orientation="vertical" size={16}>
            <div>
              <h3>Admin Access Token</h3>
              <p className="muted">公开部署后，保存配置、上传解析、确认案例和批量导入都会校验 `ADMIN_ACCESS_TOKEN`。令牌只保存在当前浏览器会话里，关闭标签页后需要重新输入。</p>
            </div>
            <div>
              <h3>这两个 Supabase 值是什么？</h3>
              <p className="muted">Project URL 是你的 Supabase 项目地址。Service Role Key 是服务端密钥，允许 Next.js API 写数据库和 Storage，不能放到浏览器代码里。</p>
            </div>
            <div>
              <h3>在哪里找？</h3>
              <ul className="list">
                <li>Supabase Dashboard → Project Settings → API。</li>
                <li>复制 Project URL 到 URL 字段。</li>
                <li>复制 service_role / secret key 到 Service Role Key。</li>
                <li>Anon key 当前前端没有直接使用，可以先留空。</li>
              </ul>
            </div>
            <div>
              <h3>SiliconFlow</h3>
              <p className="muted">Base URL 用 `https://api.siliconflow.cn/v1`，选择支持视觉输入的 VLM 模型。上传 log 图时会通过服务端调用 `/chat/completions`。</p>
            </div>
          </Space>
        </Card>
      </Col>
    </Row>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="antd-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
