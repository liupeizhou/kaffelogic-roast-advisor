import SettingsPanel from "@/components/settings-panel";

export default function SettingsPage() {
  return (
    <div className="page">
      <section className="page-header compact-header">
        <p className="eyebrow">后台配置</p>
        <h1>连接 Supabase 和视觉模型。</h1>
        <p className="lede">
          配置会写入本机 `.env.local`。密钥只由服务端 API 使用；生产部署前需要给这个页面加登录保护。
        </p>
      </section>
      <SettingsPanel />
    </div>
  );
}
