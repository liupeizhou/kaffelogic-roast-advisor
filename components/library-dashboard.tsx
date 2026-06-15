"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Col, Input, Row, Space, Spin, Statistic, Tag, Tooltip } from "antd";
import { Database, FolderInput, RefreshCw, Search, UploadCloud } from "lucide-react";
import AnimatedRoastCurve, { type AnimatedRoastProfile } from "@/components/animated-roast-curve";
import OfficialProfileGuide from "@/components/official-profile-guide";
import { adminHeaders, getStoredAdminToken, setStoredAdminToken } from "@/lib/admin-client";
import type { Locale } from "@/lib/i18n";
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

export default function LibraryDashboard({ locale = "zh", mode = "customer" }: { locale?: Locale; mode?: "customer" | "admin" }) {
  const zh = locale === "zh";
  const isAdmin = mode === "admin";
  const [profiles, setProfiles] = useState<RoastProfileRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [rootPath, setRootPath] = useState(DEFAULT_REFERENCE_ROOT);
  const [adminToken, setAdminToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResponse | null>(null);

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/library/profiles", { cache: "no-store" });
      const payload = await response.json() as ProfilesResponse;
      if (!response.ok) throw new Error(payload.error ?? (zh ? "读取曲线库失败。" : "Failed to load profile library."));
      setProfiles(payload.profiles);
      setSelectedId((current) => current ?? payload.profiles[0]?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : (zh ? "读取曲线库失败。" : "Failed to load profile library."));
    } finally {
      setLoading(false);
    }
  }, [zh]);

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
      if (!response.ok) throw new Error(payload.error ?? (zh ? "导入参考曲线失败。" : "Failed to import reference curves."));
      setImportResult(payload);
      await loadProfiles();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : (zh ? "导入参考曲线失败。" : "Failed to import reference curves."));
    } finally {
      setImporting(false);
    }
  }

  useEffect(() => {
    setAdminToken(getStoredAdminToken());
    void loadProfiles();
  }, [loadProfiles]);

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
          <Tag color="green">{isAdmin ? (zh ? "管理后台" : "Admin console") : (zh ? "曲线/案例库" : "Profiles & cases")}</Tag>
          <h1>
            {isAdmin
              ? (zh ? "导入、校验和管理官方参考曲线。" : "Import, verify and manage official reference profiles.")
              : (zh ? "查询曲线资料库，查看动态预览和官方适用逻辑。" : "Browse profile library with animated previews and official fit logic.")}
          </h1>
        </div>
        <Space size={8}>
          <Tooltip title="重新读取 Supabase 曲线表">
            <Button icon={<RefreshCw size={16} />} onClick={loadProfiles} loading={loading} />
          </Tooltip>
          {isAdmin ? (
            <Button type="primary" icon={<UploadCloud size={16} />} onClick={importReferenceCurves} loading={importing}>
              {zh ? "导入参考曲线" : "Import references"}
            </Button>
          ) : null}
        </Space>
      </section>

      {error ? <Alert type="warning" showIcon message={error} className="library-alert" /> : null}
      {importResult ? (
        <Alert
          type={importResult.failed ? "warning" : "success"}
          showIcon
          className="library-alert"
          message={zh
            ? `扫描 ${importResult.total} 条 .kpro，新增 ${importResult.imported}，跳过 ${importResult.skipped}，失败 ${importResult.failed}。`
            : `Scanned ${importResult.total} .kpro files, imported ${importResult.imported}, skipped ${importResult.skipped}, failed ${importResult.failed}.`}
        />
      ) : null}

      <Row gutter={[16, 16]} className="library-stats">
        <Col xs={12} md={6}><Card><Statistic title={zh ? "曲线总数" : "Profiles"} value={profiles.length} prefix={<Database size={18} />} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title={zh ? "海拔标签" : "Altitude tags"} value={altitudeCount} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title={zh ? "日晒适配" : "Natural fit"} value={naturalCount} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title={zh ? "水洗适配" : "Washed fit"} value={washedCount} /></Card></Col>
      </Row>

      <div className="library-grid">
        <aside className="library-sidebar">
          {isAdmin ? (
            <Card title={<span className="card-title"><FolderInput size={18} />{zh ? "参考曲线导入" : "Reference import"}</span>}>
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
                  {zh ? "扫描并写入 Supabase" : "Scan and write to Supabase"}
                </Button>
                <span className="muted">{zh ? "导入只处理 `.kpro`，自动跳过 `._*` 和 `.DS_Store`。重复文件按 hash 去重。" : "Only .kpro files are imported. ._* and .DS_Store are skipped; duplicates are de-duped by hash."}</span>
              </Space>
            </Card>
          ) : null}

          <Card title={<span className="card-title"><Search size={18} />{zh ? "曲线索引" : "Profile index"}</span>}>
            <Space orientation="vertical" size={12} className="full-width">
              <Input placeholder={zh ? "搜索名称、处理法、设计者" : "Search name, process, designer"} value={query} onChange={(event) => setQuery(event.target.value)} />
              <div className="profile-list">
                {loading ? <Spin /> : null}
                {!loading && !filteredProfiles.length ? (
                  <div className="empty-profile-list">
                    {zh
                      ? (isAdmin
                        ? "暂无 Supabase 曲线。请先配置 Supabase URL / service role key，并执行 migration。"
                        : "暂无公开曲线。管理员导入官方曲线后，这里会显示可浏览资料库。")
                      : (isAdmin
                        ? "No Supabase profiles yet. Configure Supabase URL / service role key and run migrations first."
                        : "No public profiles yet. The library will appear after official profiles are imported.")}
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
          <OfficialProfileGuide
            locale={locale}
            compact
            profile={selectedProfile ? {
              name: selectedProfile.display_name ?? selectedProfile.short_name,
              description: selectedProfile.description,
              processFit: selectedProfile.process_fit,
              expectedColourChangeTemp: selectedProfile.expected_colour_change_temp,
              expectedFirstCrackTemp: selectedProfile.expected_first_crack_temp,
              roastCurvePoints: selectedProfile.roast_curve_points
            } : null}
          />
          <Card className="profile-detail-card" title={zh ? "曲线解析字段" : "Parsed profile fields"}>
            {selectedProfile ? (
              <div className="detail-grid">
                <Detail label={zh ? "文件名" : "File name"} value={selectedProfile.file_name} />
                <Detail label={zh ? "设计者" : "Designer"} value={selectedProfile.designer || (zh ? "未标注" : "Unspecified")} />
                <Detail label={zh ? "推荐 Level" : "Recommended level"} value={selectedProfile.recommended_level ?? "N/A"} />
                <Detail label={zh ? "预计一爆温度" : "Expected FC"} value={selectedProfile.expected_first_crack_temp ? `${selectedProfile.expected_first_crack_temp} C` : "N/A"} />
                <Detail label={zh ? "温度点数" : "Temperature points"} value={selectedProfile.roast_curve_points.length} />
                <Detail label={zh ? "风速点数" : "Fan points"} value={selectedProfile.fan_curve_points.length} />
              </div>
            ) : (
              <span className="muted">{zh ? "连接 Supabase 并导入 `.kpro` 后，这里会显示真实解析字段。" : "Connect Supabase and import .kpro files to show parsed fields here."}</span>
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
