import type { Metadata } from "next";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import AntdProviders from "@/components/antd-providers";
import "antd/dist/reset.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kaffelogic Roast Advisor",
  description: "Kaffelogic 曲线推荐、上传解析与烘焙诊断工作台"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <AntdRegistry>
          <AntdProviders>{children}</AntdProviders>
        </AntdRegistry>
      </body>
    </html>
  );
}
