import LocalizedHomePage from "@/components/home-page";
import { normalizeLocale } from "@/lib/i18n";

export default async function LocaleHomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <LocalizedHomePage locale={normalizeLocale(locale)} />;
}
