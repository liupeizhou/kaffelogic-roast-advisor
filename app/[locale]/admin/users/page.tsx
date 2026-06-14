import AdminUserGrants from "@/components/admin-user-grants";
import { getDictionary, normalizeLocale } from "@/lib/i18n";

export default async function AdminUsersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const normalizedLocale = normalizeLocale(locale);
  const t = getDictionary(normalizedLocale);
  return (
    <div className="page">
      <section className="page-header compact-header">
        <p className="eyebrow">{t.nav.users}</p>
        <h1>{normalizedLocale === "zh" ? "手动开通套餐和按量额度。" : "Manually grant plans and credits."}</h1>
        <p className="lede">
          {normalizedLocale === "zh"
            ? "v1 payment provider 使用 manual 模式：输入 Supabase 用户 ID 后开通套餐或增加按量次数。"
            : "The v1 payment provider runs in manual mode: enter a Supabase user ID to grant a plan or credits."}
        </p>
      </section>
      <AdminUserGrants locale={normalizedLocale} />
    </div>
  );
}
