"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, Coffee, Database, Languages, LayoutDashboard, LogIn, LogOut, PencilRuler, Settings, UploadCloud, UserCog, UserRound } from "lucide-react";
import { Button, Layout, Menu, Space } from "antd";
import type { MenuProps } from "antd";
import { getDictionary, stripLocale, withLocale, type Locale } from "@/lib/i18n";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const { Header, Content, Sider } = Layout;

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { locale, path } = stripLocale(pathname);
  const dictionary = getDictionary(locale);
  const [email, setEmail] = useState<string | null>(null);
  const isAdminArea = path === "/admin" || path.startsWith("/admin/");

  const customerMenuItems = useMemo<MenuProps["items"]>(() => [
    { key: "/recommend", icon: <BarChart3 size={16} />, label: <Link href={withLocale(locale, "/recommend")}>{dictionary.nav.recommend}</Link> },
    { key: "/upload", icon: <UploadCloud size={16} />, label: <Link href={withLocale(locale, "/upload")}>{dictionary.nav.upload}</Link> },
    { key: "/library", icon: <Database size={16} />, label: <Link href={withLocale(locale, "/library")}>{dictionary.nav.library}</Link> },
    { key: "/editor", icon: <PencilRuler size={16} />, label: <Link href={withLocale(locale, "/editor")}>{dictionary.nav.editor}</Link> },
    { key: "/account", icon: <UserRound size={16} />, label: <Link href={withLocale(locale, "/account")}>{dictionary.nav.account}</Link> }
  ], [dictionary, locale]);

  const adminMenuItems = useMemo<MenuProps["items"]>(() => [
    { key: "/admin", icon: <LayoutDashboard size={16} />, label: <Link href={withLocale(locale, "/admin")}>{dictionary.nav.adminHome}</Link> },
    { key: "/admin/library", icon: <Database size={16} />, label: <Link href={withLocale(locale, "/admin/library")}>{dictionary.nav.adminLibrary}</Link> },
    { key: "/admin/settings", icon: <Settings size={16} />, label: <Link href={withLocale(locale, "/admin/settings")}>{dictionary.nav.settings}</Link> },
    { key: "/admin/users", icon: <UserCog size={16} />, label: <Link href={withLocale(locale, "/admin/users")}>{dictionary.nav.users}</Link> }
  ], [dictionary, locale]);

  const menuItems = isAdminArea ? adminMenuItems : customerMenuItems;

  const selectedKey = menuItems?.find((item) => item && "key" in item && path.startsWith(String(item.key)))?.key?.toString();
  const nextLocale: Locale = locale === "zh" ? "en" : "zh";
  const nextLanguageHref = withLocale(nextLocale, path);

  useEffect(() => {
    try {
      const supabase = createSupabaseBrowserClient();
      supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null)).catch(() => setEmail(null));
      const { data } = supabase.auth.onAuthStateChange((_event, session) => setEmail(session?.user.email ?? null));
      return () => data.subscription.unsubscribe();
    } catch {
      setEmail(null);
      return undefined;
    }
  }, []);

  async function signOut() {
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
    } finally {
      setEmail(null);
      router.push(withLocale(locale, "/login"));
      router.refresh();
    }
  }

  const brandHref = withLocale(locale, isAdminArea ? "/admin" : "/");
  const switchHref = withLocale(locale, isAdminArea ? "/" : "/admin");

  return (
    <Layout className={`antd-shell${isAdminArea ? " admin-antd-shell" : ""}`}>
      <Sider className="desktop-sider" width={248} breakpoint="lg" collapsedWidth={0}>
        <Link href={brandHref} className="sider-brand">
          <Coffee size={24} />
          <span>
            <strong>{isAdminArea ? "Kaffelogic Admin" : "Kaffelogic"}</strong>
            <small>{isAdminArea ? dictionary.nav.admin : "Roast Advisor"}</small>
          </span>
        </Link>
        <Menu theme="dark" mode="inline" selectedKeys={selectedKey ? [selectedKey] : []} items={menuItems} />
      </Sider>
      <Layout>
        <Header className="antd-header">
          <Link href={brandHref} className="mobile-brand">
            <Coffee size={20} />
            <span>{isAdminArea ? dictionary.nav.admin : "Kaffelogic Roast Advisor"}</span>
          </Link>
          <Space size={10} className="header-actions">
            <span className="status-dot" />
            <span className="header-email">{email ?? dictionary.status}</span>
            <Link href={switchHref}>
              <Button size="small" icon={isAdminArea ? <Coffee size={14} /> : <Settings size={14} />}>
                {isAdminArea ? dictionary.nav.frontend : dictionary.nav.admin}
              </Button>
            </Link>
            <Link href={nextLanguageHref}>
              <Button size="small" icon={<Languages size={14} />}>{dictionary.actions.language}</Button>
            </Link>
            {email ? (
              <Button size="small" icon={<LogOut size={14} />} onClick={signOut}>{dictionary.actions.signOut}</Button>
            ) : (
              <Link href={withLocale(locale, "/login")}>
                <Button size="small" type="primary" icon={<LogIn size={14} />}>{dictionary.actions.signIn}</Button>
              </Link>
            )}
          </Space>
        </Header>
        <Content className="antd-content">{children}</Content>
      </Layout>
    </Layout>
  );
}
