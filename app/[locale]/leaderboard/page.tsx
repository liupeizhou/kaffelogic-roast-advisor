import CurveLeaderboard from "@/components/curve-leaderboard";
import { getDictionary, normalizeLocale } from "@/lib/i18n";

export default async function LeaderboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const normalizedLocale = normalizeLocale(locale);
  const t = getDictionary(normalizedLocale);
  return (
    <div className="page wide-page">
      <section className="page-header">
        <p className="eyebrow">{t.nav.leaderboard}</p>
        <h1>{normalizedLocale === "zh" ? "按下载量与点评评分加权的曲线排行榜。" : "Profile ranking weighted by downloads and review scores."}</h1>
        <p className="lede">{normalizedLocale === "zh" ? "下载说明曲线被使用，点评评分说明曲线被验证；两者一起构成当前排行。" : "Downloads show adoption; reviews show validation. Both feed the current ranking."}</p>
      </section>
      <CurveLeaderboard locale={normalizedLocale} />
    </div>
  );
}
