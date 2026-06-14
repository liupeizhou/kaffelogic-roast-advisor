import { notFound } from "next/navigation";
import SharePageView from "@/components/share-page";
import { getSharePage } from "@/lib/roast-persistence";
import { getDictionary, normalizeLocale } from "@/lib/i18n";

export default async function PublicSharePage({
  params
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const normalizedLocale = normalizeLocale(locale);
  const share = await getSharePage(slug);
  if (!share) notFound();
  return (
    <div className="page wide-page">
      <SharePageView locale={normalizedLocale} share={share} />
    </div>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const share = await getSharePage(slug);
  const t = getDictionary(normalizeLocale(locale));
  return {
    title: share?.title ?? t.share.title,
    description: share?.summary ?? t.share.notFound
  };
}
