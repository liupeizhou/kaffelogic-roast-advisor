import AppShell from "@/components/app-shell";
import { normalizeLocale } from "@/lib/i18n";

export default async function LocaleLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  normalizeLocale(locale);
  return <AppShell>{children}</AppShell>;
}
