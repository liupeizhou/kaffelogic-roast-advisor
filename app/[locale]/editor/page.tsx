import CurveEditor from "@/components/curve-editor";
import { getDictionary, normalizeLocale } from "@/lib/i18n";

export default async function EditorPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const normalizedLocale = normalizeLocale(locale);
  const t = getDictionary(normalizedLocale);
  return (
    <div className="page wide-page">
      <section className="page-header compact-header">
        <p className="eyebrow">{t.editor.eyebrow}</p>
        <h1>{t.editor.title}</h1>
        <p className="lede">{t.editor.lede}</p>
      </section>
      <CurveEditor locale={normalizedLocale} />
    </div>
  );
}
