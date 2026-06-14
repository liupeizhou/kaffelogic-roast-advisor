"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Coffee, Database, Settings, UploadCloud } from "lucide-react";
import { Layout, Menu, Space } from "antd";
import type { MenuProps } from "antd";

const { Header, Content, Sider } = Layout;

const menuItems: MenuProps["items"] = [
  {
    key: "/recommend",
    icon: <BarChart3 size={16} />,
    label: <Link href="/recommend">推荐顾问</Link>
  },
  {
    key: "/upload",
    icon: <UploadCloud size={16} />,
    label: <Link href="/upload">上传分析</Link>
  },
  {
    key: "/library",
    icon: <Database size={16} />,
    label: <Link href="/library">曲线/案例库</Link>
  },
  {
    key: "/admin/settings",
    icon: <Settings size={16} />,
    label: <Link href="/admin/settings">后台配置</Link>
  }
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const selectedKey = menuItems?.find((item) => item && "key" in item && pathname.startsWith(String(item.key)))?.key?.toString();

  return (
    <Layout className="antd-shell">
      <Sider className="desktop-sider" width={248} breakpoint="lg" collapsedWidth={0}>
        <Link href="/" className="sider-brand">
          <Coffee size={24} />
          <span>
            <strong>Kaffelogic</strong>
            <small>Roast Advisor</small>
          </span>
        </Link>
        <Menu theme="dark" mode="inline" selectedKeys={selectedKey ? [selectedKey] : []} items={menuItems} />
      </Sider>
      <Layout>
        <Header className="antd-header">
          <Link href="/" className="mobile-brand">
            <Coffee size={20} />
            <span>Kaffelogic Roast Advisor</span>
          </Link>
          <Space size={10} className="header-actions">
            <span className="status-dot" />
            <span>Local bench</span>
          </Space>
        </Header>
        <Content className="antd-content">{children}</Content>
      </Layout>
    </Layout>
  );
}
