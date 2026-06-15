import Link from "next/link";
import { Card, Col, Row, Space, Tag } from "antd";
import { Database, Settings, UserCog } from "lucide-react";
import { getDictionary, normalizeLocale, withLocale } from "@/lib/i18n";

export default async function AdminHomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const normalizedLocale = normalizeLocale(locale);
  const t = getDictionary(normalizedLocale);
  const zh = normalizedLocale === "zh";

  return (
    <div className="page wide-page">
      <section className="page-header">
        <p className="eyebrow">{t.nav.admin}</p>
        <h1>{zh ? "管理后台只处理配置、导入和用户授权。" : "Admin console is reserved for configuration, imports and user grants."}</h1>
        <p className="lede">
          {zh
            ? "客户前台不再暴露 Admin Token、批量导入和服务端密钥配置。后续你配置 API 后，数据流可以在这里独立验证。"
            : "The customer app no longer exposes admin tokens, bulk imports or server-side key settings. After API configuration, data flows can be verified here independently."}
        </p>
      </section>
      <Row gutter={[16, 16]}>
        <AdminCard href={withLocale(normalizedLocale, "/admin/library")} icon={<Database size={22} />} title={t.nav.adminLibrary} text={zh ? "扫描本地官方 .kpro 目录，写入 Supabase 曲线库。" : "Scan local official .kpro folders and write them into Supabase."} />
        <AdminCard href={withLocale(normalizedLocale, "/admin/settings")} icon={<Settings size={22} />} title={t.nav.settings} text={zh ? "管理 Supabase、SiliconFlow/OpenAI 和服务端运行配置。" : "Manage Supabase, SiliconFlow/OpenAI and server runtime config."} />
        <AdminCard href={withLocale(normalizedLocale, "/admin/users")} icon={<UserCog size={22} />} title={t.nav.users} text={zh ? "手动开通套餐、增加按量额度和管理用户测试权限。" : "Manually grant plans, credits and test access."} />
      </Row>
      <div className="admin-separation-note">
        <Tag color="green">{zh ? "前后台已分离" : "Separated"}</Tag>
        <span>{zh ? "客户前台入口：" : "Customer app:"}</span>
        <Link href={withLocale(normalizedLocale, "/")}>{withLocale(normalizedLocale, "/")}</Link>
      </div>
    </div>
  );
}

function AdminCard({ href, icon, title, text }: { href: string; icon: React.ReactNode; title: string; text: string }) {
  return (
    <Col xs={24} lg={8}>
      <Link href={href}>
        <Card hoverable className="feature-card">
          <Space orientation="vertical" size={14}>
            <span className="icon-title">{icon}{title}</span>
            <span className="muted">{text}</span>
          </Space>
        </Card>
      </Link>
    </Col>
  );
}
