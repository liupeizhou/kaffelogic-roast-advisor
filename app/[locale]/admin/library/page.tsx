import LibraryDashboard from "@/components/library-dashboard";
import { normalizeLocale } from "@/lib/i18n";

export default async function AdminLibraryPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <div className="page wide-page">
      <LibraryDashboard locale={normalizeLocale(locale)} mode="admin" />
    </div>
  );
}
