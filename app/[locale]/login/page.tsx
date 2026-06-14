import EmailOtpLogin from "@/components/email-otp-login";
import { getDictionary, normalizeLocale } from "@/lib/i18n";

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const normalizedLocale = normalizeLocale(locale);
  const t = getDictionary(normalizedLocale);
  return (
    <div className="page auth-page">
      <section className="page-header compact-header">
        <p className="eyebrow">{t.actions.signIn}</p>
        <h1>{t.login.title}</h1>
        <p className="lede">{t.login.lede}</p>
      </section>
      <EmailOtpLogin locale={normalizedLocale} />
    </div>
  );
}
