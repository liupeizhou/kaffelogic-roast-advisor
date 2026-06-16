"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Alert, Button, Card, Col, Collapse, Input, InputNumber, List, Row, Select, Space, Spin, Statistic, Steps, Tag, Tooltip, Upload } from "antd";
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

type TaxonomyResponse = {
  profile: RoastProfileRecord;
  allTags: Array<{ id: string; name: string }>;
  allGroups: Array<{ id: string; name: string }>;
  changeLogs: Array<{
    id: string;
    action: string;
    note: string | null;
    created_at: string;
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
  const [taxonomyLoading, setTaxonomyLoading] = useState(false);
  const [taxonomySaving, setTaxonomySaving] = useState(false);
  const [taxonomyError, setTaxonomyError] = useState<string | null>(null);
  const [taxonomyMessage, setTaxonomyMessage] = useState<string | null>(null);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [availableGroups, setAvailableGroups] = useState<string[]>([]);
  const [tagNames, setTagNames] = useState<string[]>([]);
  const [groupNames, setGroupNames] = useState<string[]>([]);
  const [initialScore, setInitialScore] = useState<number | null>(null);
  const [initialNotesText, setInitialNotesText] = useState("");
  const [changeLogs, setChangeLogs] = useState<TaxonomyResponse["changeLogs"]>([]);

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

  const applyTaxonomyPayload = useCallback((payload: TaxonomyResponse) => {
    setAvailableTags(payload.allTags.map((tag) => tag.name));
    setAvailableGroups(payload.allGroups.map((group) => group.name));
    setTagNames(payload.profile.tags?.map((tag) => tag.name) ?? []);
    setGroupNames(payload.profile.groups?.map((group) => group.name) ?? []);
    setInitialScore(payload.profile.initial_recommendation_score ?? null);
    setInitialNotesText((payload.profile.initial_recommendation_notes ?? []).join("\n"));
    setChangeLogs(payload.changeLogs);
    setProfiles((current) => current.map((profile) => profile.id === payload.profile.id ? payload.profile : profile));
  }, []);

  const loadTaxonomy = useCallback(async (profileId: string) => {
    if (!isAdmin) return;
    setTaxonomyLoading(true);
    setTaxonomyError(null);
    try {
      const response = await fetch(`/api/admin/profiles/${profileId}/taxonomy`, { cache: "no-store" });
      const payload = await response.json() as TaxonomyResponse;
      if (!response.ok) throw new Error(payload.error ?? (zh ? "读取分类配置失败。" : "Failed to load taxonomy."));
      applyTaxonomyPayload(payload);
    } catch (loadError) {
      setTaxonomyError(loadError instanceof Error ? loadError.message : (zh ? "读取分类配置失败。" : "Failed to load taxonomy."));
    } finally {
      setTaxonomyLoading(false);
    }
  }, [applyTaxonomyPayload, isAdmin, zh]);

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
      profile.description,
      ...(profile.tags?.map((tag) => tag.name) ?? []),
      ...(profile.groups?.map((group) => group.name) ?? [])
    ].some((value) => String(value ?? "").toLowerCase().includes(normalized)));
  }, [profiles, query]);

  const selectedProfile = profiles.find((profile) => profile.id === selectedId) ?? filteredProfiles[0] ?? null;
  const selectedRadar = selectedProfile ? buildCurveRadarMetrics(selectedProfile.roast_curve_points, selectedProfile.fan_curve_points) : [];
  const altitudeCount = profiles.filter((profile) => profile.altitude_range).length;
  const naturalCount = profiles.filter((profile) => profile.process_fit === "natural").length;
  const washedCount = profiles.filter((profile) => profile.process_fit === "washed").length;

  useEffect(() => {
    setTaxonomyMessage(null);
    if (isAdmin && selectedProfile?.id) {
      void loadTaxonomy(selectedProfile.id);
    }
  }, [isAdmin, loadTaxonomy, selectedProfile?.id]);

  async function saveTaxonomy() {
    if (!selectedProfile) return;
    setTaxonomySaving(true);
    setTaxonomyError(null);
    setTaxonomyMessage(null);
    try {
      const response = await fetch(`/api/admin/profiles/${selectedProfile.id}/taxonomy`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tagNames,
          groupNames,
          initialScore,
          initialNotes: initialNotesText.split("\n").map((line) => line.trim()).filter(Boolean),
          note: zh ? "管理后台保存分类、分组与初始评分。" : "Admin taxonomy and initial recommendation update."
        })
      });
      const payload = await response.json() as TaxonomyResponse;
      if (!response.ok) throw new Error(payload.error ?? (zh ? "保存分类配置失败。" : "Failed to save taxonomy."));
      applyTaxonomyPayload(payload);
      setTaxonomyMessage(zh ? "已保存分类、分组与初始评分，并写入变更记录。" : "Saved taxonomy, groups, initial score, and audit log.");
    } catch (saveError) {
      setTaxonomyError(saveError instanceof Error ? saveError.message : (zh ? "保存分类配置失败。" : "Failed to save taxonomy."));
    } finally {
      setTaxonomySaving(false);
    }
  }

  async function generateInitialRecommendation() {
    if (!selectedProfile) return;
    setTaxonomySaving(true);
    setTaxonomyError(null);
    setTaxonomyMessage(null);
    try {
      const response = await fetch(`/api/admin/profiles/${selectedProfile.id}/taxonomy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "recommend" })
      });
      const payload = await response.json() as TaxonomyResponse;
      if (!response.ok) throw new Error(payload.error ?? (zh ? "生成初始评分失败。" : "Failed to generate initial score."));
      applyTaxonomyPayload(payload);
      setTaxonomyMessage(zh ? "已根据当前曲线字段重新生成初始推荐评分。" : "Initial recommendation score regenerated.");
    } catch (saveError) {
      setTaxonomyError(saveError instanceof Error ? saveError.message : (zh ? "生成初始评分失败。" : "Failed to generate initial score."));
    } finally {
      setTaxonomySaving(false);
    }
  }

  async function rollbackTaxonomy(changeId: string) {
    if (!selectedProfile) return;
    setTaxonomySaving(true);
    setTaxonomyError(null);
    setTaxonomyMessage(null);
    try {
      const response = await fetch(`/api/admin/profiles/${selectedProfile.id}/taxonomy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rollback", changeId })
      });
      const payload = await response.json() as TaxonomyResponse;
      if (!response.ok) throw new Error(payload.error ?? (zh ? "回滚失败。" : "Rollback failed."));
      applyTaxonomyPayload(payload);
      setTaxonomyMessage(zh ? "已回滚到所选变更前的分类和评分快照。" : "Rolled back to the snapshot before that change.");
    } catch (saveError) {
      setTaxonomyError(saveError instanceof Error ? saveError.message : (zh ? "回滚失败。" : "Rollback failed."));
    } finally {
      setTaxonomySaving(false);
    }
  }

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
                    {profile.tags?.length || profile.groups?.length ? (
                      <span className="profile-list-tags">
                        {profile.groups?.slice(0, 2).map((group) => <Tag key={group.id}>{group.name}</Tag>)}
                        {profile.tags?.slice(0, 3).map((tag) => <Tag key={tag.id} color={tag.color || "green"}>{tag.name}</Tag>)}
                      </span>
                    ) : null}
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
                  {typeof selectedProfile.initial_recommendation_score === "number" ? (
                    <Tag color="green">{zh ? "初始推荐" : "Initial"} {selectedProfile.initial_recommendation_score}/100</Tag>
                  ) : null}
                  {selectedProfile.groups?.map((group) => <Tag key={group.id}>{group.name}</Tag>)}
                  {selectedProfile.tags?.map((tag) => <Tag key={tag.id} color={tag.color || "green"}>{tag.name}</Tag>)}
                </Space>
                <div className="detail-grid">
                  <Detail label={zh ? "文件名" : "File name"} value={selectedProfile.file_name} />
                  <Detail label={zh ? "设计者" : "Designer"} value={selectedProfile.designer || (zh ? "未标注" : "Unspecified")} />
                  <Detail label={zh ? "推荐 Level" : "Recommended level"} value={selectedProfile.recommended_level ?? "N/A"} />
                  <Detail label={zh ? "预计一爆温度" : "Expected FC"} value={selectedProfile.expected_first_crack_temp ? `${selectedProfile.expected_first_crack_temp} C` : "N/A"} />
                  <Detail label={zh ? "温度点数" : "Temperature points"} value={selectedProfile.roast_curve_points.length} />
                  <Detail label={zh ? "风速点数" : "Fan points"} value={selectedProfile.fan_curve_points.length} />
                  <Detail label={zh ? "初始推荐评分" : "Initial recommendation"} value={typeof selectedProfile.initial_recommendation_score === "number" ? `${selectedProfile.initial_recommendation_score}/100` : "N/A"} />
                  <Detail label={zh ? "分组" : "Groups"} value={selectedProfile.groups?.map((group) => group.name).join("、") || "N/A"} />
                  <Detail label={zh ? "标签" : "Tags"} value={selectedProfile.tags?.map((tag) => tag.name).join("、") || "N/A"} />
                </div>
                {selectedProfile.initial_recommendation_notes?.length ? (
                  <ul className="list">
                    {selectedProfile.initial_recommendation_notes.map((note) => <li key={note}>{note}</li>)}
                  </ul>
                ) : null}
              </Space>
            ) : (
              <span className="muted">{zh ? "连接 Supabase 并导入 `.kpro` 后，这里会显示真实解析字段。" : "Connect Supabase and import .kpro files to show parsed fields here."}</span>
            )}
          </Card>

          {isAdmin && selectedProfile ? (
            <Card className="profile-detail-card" title={zh ? "管理组：标签、分组、评分与回滚" : "Management: tags, groups, score and rollback"}>
              <Spin spinning={taxonomyLoading}>
                <Space orientation="vertical" size={14} className="full-width">
                  {taxonomyError ? <Alert type="warning" showIcon message={taxonomyError} /> : null}
                  {taxonomyMessage ? <Alert type="success" showIcon message={taxonomyMessage} /> : null}
                  <Row gutter={[12, 12]}>
                    <Col xs={24} md={12}>
                      <label className="form-label">{zh ? "标签" : "Tags"}</label>
                      <Select
                        mode="tags"
                        className="full-width"
                        placeholder={zh ? "例如：日晒、高海拔、花果调" : "e.g. Natural, high altitude, floral"}
                        value={tagNames}
                        options={availableTags.map((name) => ({ value: name, label: name }))}
                        onChange={setTagNames}
                      />
                    </Col>
                    <Col xs={24} md={12}>
                      <label className="form-label">{zh ? "分组" : "Groups"}</label>
                      <Select
                        mode="tags"
                        className="full-width"
                        placeholder={zh ? "例如：官方推荐、用户精选、测试中" : "e.g. Official, curated, testing"}
                        value={groupNames}
                        options={availableGroups.map((name) => ({ value: name, label: name }))}
                        onChange={setGroupNames}
                      />
                    </Col>
                    <Col xs={24} md={8}>
                      <label className="form-label">{zh ? "初始推荐评分" : "Initial score"}</label>
                      <InputNumber min={0} max={100} className="full-width" value={initialScore} onChange={(value) => setInitialScore(value)} />
                    </Col>
                    <Col xs={24} md={16}>
                      <label className="form-label">{zh ? "推荐备注" : "Recommendation notes"}</label>
                      <Input.TextArea
                        rows={4}
                        value={initialNotesText}
                        onChange={(event) => setInitialNotesText(event.target.value)}
                        placeholder={zh ? "每行一条，保存时进入变更记录。" : "One note per line. Saved into the audit log."}
                      />
                    </Col>
                  </Row>
                  <Space wrap>
                    <Button type="primary" onClick={saveTaxonomy} loading={taxonomySaving}>
                      {zh ? "保存分类与评分" : "Save taxonomy"}
                    </Button>
                    <Button onClick={generateInitialRecommendation} loading={taxonomySaving}>
                      {zh ? "生成初始评分推荐" : "Generate initial score"}
                    </Button>
                  </Space>
                  <List
                    size="small"
                    header={zh ? "变更记录（可回滚到某次变更前）" : "Audit log (rollback to before a change)"}
                    dataSource={changeLogs}
                    locale={{ emptyText: zh ? "暂无变更记录" : "No changes yet" }}
                    renderItem={(item) => (
                      <List.Item
                        actions={[
                          <Button key="rollback" size="small" onClick={() => rollbackTaxonomy(item.id)} loading={taxonomySaving}>
                            {zh ? "回滚" : "Rollback"}
                          </Button>
                        ]}
                      >
                        <List.Item.Meta
                          title={`${actionLabel(item.action, zh)} · ${new Date(item.created_at).toLocaleString(zh ? "zh-CN" : "en-US", { hour12: false })}`}
                          description={item.note || (zh ? "无备注" : "No note")}
                        />
                      </List.Item>
                    )}
                  />
                </Space>
              </Spin>
            </Card>
          ) : null}
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

function actionLabel(action: string, zh: boolean) {
  if (action === "taxonomy_update") return zh ? "分类/评分更新" : "Taxonomy update";
  if (action === "initial_recommendation") return zh ? "初始评分推荐" : "Initial recommendation";
  if (action === "rollback") return zh ? "回滚" : "Rollback";
  return action;
}
