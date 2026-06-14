import UploadAnalyzer from "@/components/upload-analyzer";
import { getDictionary, normalizeLocale } from "@/lib/i18n";

export default async function UploadPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const normalizedLocale = normalizeLocale(locale);
  const t = getDictionary(normalizedLocale);
  return (
    <div className="page">
      <section className="page-header">
        <p className="eyebrow">{t.uploadPage.eyebrow}</p>
        <h1>{t.uploadPage.title}</h1>
        <p className="lede">{t.uploadPage.lede}</p>
      </section>
      <UploadAnalyzer locale={normalizedLocale} />
    </div>
  );
}
