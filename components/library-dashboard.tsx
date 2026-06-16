"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Alert, Button, Card, Col, Collapse, Input, Row, Space, Spin, Statistic, Steps, Tag, Tooltip, Upload } from "antd";
import type { UploadProps } from "antd";
import { Database, Download, FolderInput, RefreshCw, Search, UploadCloud } from "lucide-react";
import AnimatedRoastCurve, { type AnimatedRoastProfile } from "@/components/animated-roast-curve";
import CurveRadarChart from "@/components/curve-radar-chart";
import OfficialProfileGuide from "@/components/official-profile-guide";
import { buildCurveRadarMetrics } from "@/lib/curve-radar";
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
  const [importFiles, setImportFiles] = useState<File[]>([]);
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
        headers: { "Content-Type": "application/json" },
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

  async function importReferenceFiles() {
    if (!importFiles.length) return;
    setImporting(true);
    setError(null);
    setImportResult(null);
    try {
      const formData = new FormData();
      importFiles.forEach((file) => formData.append("files", file));
      const response = await fetch("/api/import/reference-curves", {
        method: "POST",
        body: formData
      });
      const payload = await response.json() as ImportResponse;
      if (!response.ok) throw new Error(payload.error ?? (zh ? "导入参考曲线失败。" : "Failed to import reference curves."));
      setImportResult(payload);
      setImportFiles([]);
      await loadProfiles();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : (zh ? "导入参考曲线失败。" : "Failed to import reference curves."));
    } finally {
      setImporting(false);
    }
  }

  const uploadProps: UploadProps = {
    accept: ".kpro",
    multiple: true,
    beforeUpload: (file) => {
      setImportFiles((current) => [...current, file]);
      return false;
    },
    onRemove: (file) => {
      setImportFiles((current) => current.filter((item) => item.name !== file.name));
      return true;
    }
  };

  useEffect(() => {
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
  const selectedRadar = selectedProfile ? buildCurveRadarMetrics(selectedProfile.roast_curve_points, selectedProfile.fan_curve_points) : [];
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

      <Card className="library-guide">
        <Steps
          size="small"
          current={selectedProfile ? 2 : profiles.length ? 1 : 0}
          items={[
            { title: zh ? "导入/上传" : "Import" },
            { title: zh ? "筛选曲线" : "Filter" },
            { title: zh ? "看画像与下载" : "Inspect" }
          ]}
        />
      </Card>

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
                <Upload {...uploadProps}>
                  <Button block icon={<UploadCloud size={16} />}>{zh ? "选择多个 .kpro 直接导入" : "Select .kpro files"}</Button>
                </Upload>
                <Button block type="primary" icon={<UploadCloud size={16} />} onClick={importReferenceFiles} loading={importing} disabled={!importFiles.length}>
                  {zh ? `上传并导入 ${importFiles.length} 条` : `Upload and import ${importFiles.length}`}
                </Button>
                <Collapse
                  size="small"
                  items={[{
                    key: "path",
                    label: zh ? "本地开发：按服务器目录扫描" : "Local dev: scan server path",
                    children: (
                      <Space orientation="vertical" size={10} className="full-width">
                        <Input value={rootPath} onChange={(event) => setRootPath(event.target.value)} />
                        <Button block icon={<FolderInput size={16} />} onClick={importReferenceCurves} loading={importing}>
                          {zh ? "扫描并写入 Supabase" : "Scan and write to Supabase"}
                        </Button>
                      </Space>
                    )
                  }]}
                />
                <span className="muted">{zh ? "生产环境请用上方文件上传导入；重复文件按 hash 去重。" : "Use file upload in production; duplicates are de-duped by hash."}</span>
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
          {selectedProfile ? (
            <Card className="profile-detail-card" title={zh ? "曲线雷达画像" : "Profile radar"}>
              <CurveRadarChart locale={locale} series={[{ name: selectedProfile.display_name, color: "#f26735", metrics: selectedRadar }]} />
            </Card>
          ) : null}
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
              <Space orientation="vertical" size={16} className="full-width">
                <Space wrap>
                  <Link href={`/api/library/profiles/${selectedProfile.id}/download`}>
                    <Button type="primary" icon={<Download size={16} />}>{zh ? "读取并下载 .kpro" : "Download .kpro"}</Button>
                  </Link>
                  <Tag color="gold">{zh ? "下载" : "Downloads"} {selectedProfile.download_count ?? 0}</Tag>
                  <Tag color="blue">{zh ? "评分" : "Rating"} {Number(selectedProfile.rating_average ?? 0).toFixed(1)}</Tag>
                </Space>
                <div className="detail-grid">
                  <Detail label={zh ? "文件名" : "File name"} value={selectedProfile.file_name} />
                  <Detail label={zh ? "设计者" : "Designer"} value={selectedProfile.designer || (zh ? "未标注" : "Unspecified")} />
                  <Detail label={zh ? "推荐 Level" : "Recommended level"} value={selectedProfile.recommended_level ?? "N/A"} />
                  <Detail label={zh ? "预计一爆温度" : "Expected FC"} value={selectedProfile.expected_first_crack_temp ? `${selectedProfile.expected_first_crack_temp} C` : "N/A"} />
                  <Detail label={zh ? "温度点数" : "Temperature points"} value={selectedProfile.roast_curve_points.length} />
                  <Detail label={zh ? "风速点数" : "Fan points"} value={selectedProfile.fan_curve_points.length} />
                </div>
              </Space>
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
