import CurveEditor from "@/components/curve-editor";
import { getDictionary, normalizeLocale } from "@/lib/i18n";

export default async function EditorDetailPage({
  params
}: {
  params: Promise<{ locale: string; curveId: string }>;
}) {
  const { locale, curveId } = await params;
  const normalizedLocale = normalizeLocale(locale);
  const t = getDictionary(normalizedLocale);
  return (
    <div className="page wide-page">
      <section className="page-header compact-header">
        <p className="eyebrow">{t.editor.eyebrow}</p>
        <h1>{t.editor.title}</h1>
        <p className="lede">{t.editor.lede}</p>
      </section>
      <CurveEditor locale={normalizedLocale} curveId={curveId} />
    </div>
  );
}
