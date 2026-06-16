"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Alert, Button, Card, Col, Divider, Empty, Input, List, Rate, Row, Space, Statistic, Tag } from "antd";
import { Download, MessageSquare, Trophy } from "lucide-react";
import CurveRadarChart from "@/components/curve-radar-chart";
import { buildCurveRadarMetrics } from "@/lib/curve-radar";
import type { Locale } from "@/lib/i18n";
import type { RoastProfileRecord, RoastProfileReviewRecord } from "@/lib/roast-persistence";

type LeaderboardResponse = {
  profiles?: RoastProfileRecord[];
  error?: string;
};

export default function CurveLeaderboard({ locale }: { locale: Locale }) {
  const zh = locale === "zh";
  const [profiles, setProfiles] = useState<RoastProfileRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reviews, setReviews] = useState<RoastProfileReviewRecord[]>([]);
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = profiles.find((profile) => profile.id === selectedId) ?? profiles[0] ?? null;
  const radar = useMemo(() => selected ? buildCurveRadarMetrics(selected.roast_curve_points, selected.fan_curve_points) : [], [selected]);

  const loadReviews = useCallback(async (profileId: string) => {
    const response = await fetch(`/api/library/profiles/${profileId}/reviews`, { cache: "no-store" });
    const payload = await response.json() as { reviews?: RoastProfileReviewRecord[]; error?: string };
    if (!response.ok) throw new Error(payload.error ?? "读取评论失败。");
    setReviews(payload.reviews ?? []);
  }, []);

  const loadLeaderboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/library/leaderboard", { cache: "no-store" });
      const payload = await response.json() as LeaderboardResponse;
      if (!response.ok) throw new Error(payload.error ?? "读取排行榜失败。");
      setProfiles(payload.profiles ?? []);
      const nextSelectedId = selectedId ?? payload.profiles?.[0]?.id ?? null;
      setSelectedId(nextSelectedId);
      if (nextSelectedId) await loadReviews(nextSelectedId);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "读取排行榜失败。");
    } finally {
      setLoading(false);
    }
  }, [loadReviews, selectedId]);

  useEffect(() => {
    void loadLeaderboard();
  }, [loadLeaderboard]);

  async function selectProfile(profile: RoastProfileRecord) {
    setSelectedId(profile.id);
    setError(null);
    try {
      await loadReviews(profile.id);
    } catch (reviewError) {
      setReviews([]);
      setError(reviewError instanceof Error ? reviewError.message : "读取评论失败。");
    }
  }

  async function submitReview() {
    if (!selected) return;
    setReviewing(true);
    setError(null);
    try {
      const response = await fetch(`/api/library/profiles/${selected.id}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, body })
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "保存评论失败。");
      setBody("");
      await Promise.all([loadLeaderboard(), loadReviews(selected.id)]);
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "保存评论失败。");
    } finally {
      setReviewing(false);
    }
  }

  return (
    <div className="leaderboard-layout">
      {error ? <Alert type="warning" showIcon message={error} /> : null}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card title={<span className="card-title"><Trophy size={18} />{zh ? "曲线排行榜" : "Profile leaderboard"}</span>}>
            {!profiles.length && !loading ? <Empty description={zh ? "暂无曲线排行" : "No ranked profiles yet"} /> : null}
            <List
              loading={loading}
              dataSource={profiles}
              renderItem={(profile, index) => (
                <List.Item
                  className={profile.id === selected?.id ? "leaderboard-item active" : "leaderboard-item"}
                  actions={[
                    <Link key="download" href={`/api/library/profiles/${profile.id}/download`}>
                      <Button size="small" icon={<Download size={14} />}>{zh ? "下载" : "Download"}</Button>
                    </Link>,
                    <Button key="reviews" size="small" icon={<MessageSquare size={14} />} onClick={() => selectProfile(profile)}>{zh ? "点评" : "Reviews"}</Button>
                  ]}
                  onClick={() => void selectProfile(profile)}
                >
                  <List.Item.Meta
                    title={<Space wrap><strong>#{index + 1} {profile.display_name}</strong><Tag color="gold">{profile.leaderboard_score ?? 0}</Tag></Space>}
                    description={`${profile.process_fit} · L${profile.recommended_level ?? "?"} · ${profile.designer ?? profile.file_name}`}
                  />
                  <Space size={16} wrap>
                    <Statistic title={zh ? "下载" : "Downloads"} value={profile.download_count ?? 0} />
                    <Statistic title={zh ? "评分" : "Rating"} value={Number(profile.rating_average ?? 0)} precision={1} />
                    <Statistic title={zh ? "点评" : "Reviews"} value={profile.review_count ?? 0} />
                  </Space>
                </List.Item>
              )}
            />
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title={selected?.display_name ?? (zh ? "曲线画像" : "Profile radar")}>
            {selected ? (
              <Space orientation="vertical" size={14} className="full-width">
                <CurveRadarChart locale={locale} series={[{ name: selected.display_name, color: "#f26735", metrics: radar }]} />
                <Divider>{zh ? "非免费用户点评" : "Subscriber reviews"}</Divider>
                <Rate value={rating} onChange={setRating} />
                <Input.TextArea rows={4} value={body} onChange={(event) => setBody(event.target.value)} placeholder={zh ? "写下这条曲线的适用豆子、烘焙反馈或风险点" : "Bean fit, roast feedback or risk notes"} />
                <Button type="primary" onClick={submitReview} loading={reviewing}>{zh ? "提交点评" : "Submit review"}</Button>
                <List
                  size="small"
                  dataSource={reviews}
                  renderItem={(review) => (
                    <List.Item>
                      <Space orientation="vertical" size={4}>
                        <Rate disabled value={review.rating} />
                        <span>{review.body || (zh ? "未填写文字点评" : "No written note")}</span>
                      </Space>
                    </List.Item>
                  )}
                />
              </Space>
            ) : null}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
