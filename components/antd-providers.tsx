"use client";

import { App, ConfigProvider, theme } from "antd";
import enUS from "antd/locale/en_US";
import zhCN from "antd/locale/zh_CN";
import { usePathname } from "next/navigation";
import { stripLocale } from "@/lib/i18n";

export default function AntdProviders({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { locale } = stripLocale(pathname);

  return (
    <ConfigProvider
      locale={locale === "en" ? enUS : zhCN}
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: "#176B42",
          colorInfo: "#176B42",
          colorSuccess: "#1F7A4D",
          colorWarning: "#B45309",
          colorError: "#B91C1C",
          colorTextBase: "#111612",
          colorBgBase: "#F5F3EE",
          borderRadius: 8,
          wireframe: false,
          fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
        },
        components: {
          Layout: {
            bodyBg: "#F5F3EE",
            headerBg: "#FFFFFF",
            siderBg: "#111612",
            triggerBg: "#111612"
          },
          Menu: {
            darkItemBg: "#111612",
            darkItemSelectedBg: "#176B42",
            itemBorderRadius: 8
          },
          Card: {
            borderRadiusLG: 8
          },
          Button: {
            borderRadius: 999
          }
        }
      }}
    >
      <App>{children}</App>
    </ConfigProvider>
  );
}
