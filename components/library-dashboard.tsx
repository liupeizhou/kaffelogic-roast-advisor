"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Col, Input, Row, Space, Spin, Statistic, Tag, Tooltip } from "antd";
import { Database, FolderInput, RefreshCw, Search, UploadCloud } from "lucide-react";
import AnimatedRoastCurve, { type AnimatedRoastProfile } from "@/components/animated-roast-curve";
import { adminHeaders, getStoredAdminToken, setStoredAdminToken } from "@/lib/admin-client";
import type { RoastProfileRecord } from "@/lib/roast-persistence";

type ProfilesResponse = {
  configured: boolean;
  profiles: RoastProfileRecord[];
  error?: string;
};

type ImportResponse = {
  rootPath: string;
  total: number;
  imported: number;
  skipped: number;
  failed: number;
  items: Array<{
    fileName: string;
    path: string;
    status: "imported" | "skipped" | "failed";
    profileName?: string | null;
    reason?: string;
  }>;
  error?: string;
};

const DEFAULT_REFERENCE_ROOT = "/Volumes/Extreme SSD/01_下载归档_Downloads/kaffelogic项目";

export default function LibraryDashboard() {
  const [profiles, setProfiles] = useState<RoastProfileRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [rootPath, setRootPath] = useState(DEFAULT_REFERENCE_ROOT);
  const [adminToken, setAdminToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResponse | null>(null);

  async function loadProfiles() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/library/profiles", { cache: "no-store" });
      const payload = await response.json() as ProfilesResponse;
      if (!response.ok) throw new Error(payload.error ?? "读取曲线库失败。");
      setProfiles(payload.profiles);
      setSelectedId((current) => current ?? payload.profiles[0]?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "读取曲线库失败。");
    } finally {
      setLoading(false);
    }
  }

  async function importReferenceCurves() {
    setImporting(true);
    setError(null);
    setImportResult(null);
    try {
      const response = await fetch("/api/import/reference-curves", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...adminHeaders(adminToken) },
        body: JSON.stringify({ rootPath })
      });
      const payload = await response.json() as ImportResponse;
      if (!response.ok) throw new Error(payload.error ?? "导入参考曲线失败。");
      setImportResult(payload);
      await loadProfiles();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "导入参考曲线失败。");
    } finally {
      setImporting(false);
    }
  }

  useEffect(() => {
    setAdminToken(getStoredAdminToken());
    void loadProfiles();
  }, []);

  const filteredProfiles = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return profiles;
    return profiles.filter((profile) => [
      profile.display_name,
      profile.short_name,
      profile.designer,
      profile.process_fit,
      profile.target_brew,
      profile.source_type,
      profile.description
    ].some((value) => String(value ?? "").toLowerCase().includes(normalized)));
  }, [profiles, query]);

  const selectedProfile = profiles.find((profile) => profile.id === selectedId) ?? filteredProfiles[0] ?? null;
  const altitudeCount = profiles.filter((profile) => profile.altitude_range).length;
  const naturalCount = profiles.filter((profile) => profile.process_fit === "natural").length;
  const washedCount = profiles.filter((profile) => profile.process_fit === "washed").length;

  return (
    <div className="library-workbench">
      <section className="library-topbar">
        <div>
          <Tag color="green">曲线/案例库</Tag>
          <h1>把参考曲线变成可查询、可解释、可动态预览的烘焙工件。</h1>
        </div>
        <Space size={8}>
          <Tooltip title="重新读取 Supabase 曲线表">
            <Button icon={<RefreshCw size={16} />} onClick={loadProfiles} loading={loading} />
          </Tooltip>
          <Button type="primary" icon={<UploadCloud size={16} />} onClick={importReferenceCurves} loading={importing}>
            导入参考曲线
          </Button>
        </Space>
      </section>

      {error ? <Alert type="warning" showIcon message={error} className="library-alert" /> : null}
      {importResult ? (
        <Alert
          type={importResult.failed ? "warning" : "success"}
          showIcon
          className="library-alert"
          message={`扫描 ${importResult.total} 条 .kpro，新增 ${importResult.imported}，跳过 ${importResult.skipped}，失败 ${importResult.failed}。`}
        />
      ) : null}

      <Row gutter={[16, 16]} className="library-stats">
        <Col xs={12} md={6}><Card><Statistic title="曲线总数" value={profiles.length} prefix={<Database size={18} />} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="海拔标签" value={altitudeCount} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="日晒适配" value={naturalCount} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="水洗适配" value={washedCount} /></Card></Col>
      </Row>

      <div className="library-grid">
        <aside className="library-sidebar">
          <Card title={<span className="card-title"><FolderInput size={18} />参考曲线导入</span>}>
            <Space orientation="vertical" size={12} className="full-width">
              <Input.Password
                value={adminToken}
                onChange={(event) => {
                  setAdminToken(event.target.value);
                  setStoredAdminToken(event.target.value);
                }}
                placeholder="Admin Access Token"
              />
              <Input value={rootPath} onChange={(event) => setRootPath(event.target.value)} />
              <Button block type="primary" icon={<UploadCloud size={16} />} onClick={importReferenceCurves} loading={importing}>
                扫描并写入 Supabase
              </Button>
              <span className="muted">导入只处理 `.kpro`，自动跳过 `._*` 和 `.DS_Store`。重复文件按 hash 去重。</span>
            </Space>
          </Card>

          <Card title={<span className="card-title"><Search size={18} />曲线索引</span>}>
            <Space orientation="vertical" size={12} className="full-width">
              <Input placeholder="搜索名称、处理法、设计者" value={query} onChange={(event) => setQuery(event.target.value)} />
              <div className="profile-list">
                {loading ? <Spin /> : null}
                {!loading && !filteredProfiles.length ? (
                  <div className="empty-profile-list">
                    暂无 Supabase 曲线。右侧仍显示演示曲线。若刚开始配置，请先在后台设置 Supabase URL / service role key，并执行 migration。
                  </div>
                ) : null}
                {filteredProfiles.map((profile) => (
                  <button
                    key={profile.id}
                    className={`profile-list-item${profile.id === selectedProfile?.id ? " active" : ""}`}
                    onClick={() => setSelectedId(profile.id)}
                  >
                    <strong>{profile.display_name}</strong>
                    <span>{profile.designer || profile.file_name}</span>
                    <small>{profile.target_brew} · {profile.process_fit} · L{profile.recommended_level ?? "?"}</small>
                  </button>
                ))}
              </div>
            </Space>
          </Card>
        </aside>

        <main className="library-main">
          <AnimatedRoastCurve profile={selectedProfile as AnimatedRoastProfile | null} />
          <Card className="profile-detail-card" title="曲线解析字段">
            {selectedProfile ? (
              <div className="detail-grid">
                <Detail label="文件名" value={selectedProfile.file_name} />
                <Detail label="设计者" value={selectedProfile.designer || "未标注"} />
                <Detail label="推荐 Level" value={selectedProfile.recommended_level ?? "N/A"} />
                <Detail label="预计一爆温度" value={selectedProfile.expected_first_crack_temp ? `${selectedProfile.expected_first_crack_temp} C` : "N/A"} />
                <Detail label="温度点数" value={selectedProfile.roast_curve_points.length} />
                <Detail label="风速点数" value={selectedProfile.fan_curve_points.length} />
              </div>
            ) : (
              <span className="muted">连接 Supabase 并导入 `.kpro` 后，这里会显示真实解析字段。</span>
            )}
          </Card>
        </main>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
