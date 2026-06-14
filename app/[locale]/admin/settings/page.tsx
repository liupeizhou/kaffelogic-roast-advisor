import SettingsPanel from "@/components/settings-panel";
import { normalizeLocale } from "@/lib/i18n";

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const isZh = normalizeLocale(locale) === "zh";
  return (
    <div className="page">
      <section className="page-header compact-header">
        <p className="eyebrow">{isZh ? "后台配置" : "Admin Settings"}</p>
        <h1>{isZh ? "连接 Supabase 和视觉模型。" : "Connect Supabase and the vision model."}</h1>
        <p className="lede">
          {isZh
            ? "本地开发可以写入 .env.local；生产环境请在 Vercel 环境变量中配置相同的值。API key 只在服务端读取。"
            : "Local development can write .env.local; production should use the same values in Vercel environment variables. API keys stay server-side."}
        </p>
      </section>
      <SettingsPanel />
    </div>
  );
}
