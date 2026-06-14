import AccountDashboard from "@/components/account-dashboard";
import { getDictionary, normalizeLocale } from "@/lib/i18n";

export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const normalizedLocale = normalizeLocale(locale);
  const t = getDictionary(normalizedLocale);
  return (
    <div className="page">
      <section className="page-header compact-header">
        <p className="eyebrow">{t.quota.plan}</p>
        <h1>{t.quota.title}</h1>
        <p className="lede">
          {normalizedLocale === "zh"
            ? "额度按 GMT+8 统计。成功分析扣次，失败和非法文件不扣。"
            : "Quota is counted in GMT+8. Successful analyses consume quota; failed or invalid files do not."}
        </p>
      </section>
      <AccountDashboard locale={normalizedLocale} />
    </div>
  );
}
