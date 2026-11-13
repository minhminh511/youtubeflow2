"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { AlertTriangle, BarChart3, CheckCircle2, Clock3, Copy, ExternalLink, FileText, Flame, Link2, Loader2, Music4, Play, RefreshCw, ShieldCheck, Sparkles, Trash2, Upload, X } from "lucide-react";
import { PlatformSwitch } from "@/components/platform-switch";
import { buildTikTokAssistant, extractHashtags, TK_LIMITS, TK_PRIVACY, analyzeTikTok, type TkPrivacy } from "@/lib/tiktok-policy";
import { formatNumber } from "@/lib/client";
import type { TkOverview, TkPost, TkStatus, TkVideo } from "@/lib/tiktok-types";
import type { View, WorkspaceData } from "@/lib/types";

type Tab = "overview" | "compose" | "posts" | "trends" | "policy";
const TABS: { id: Tab; label: string; icon: typeof BarChart3 }[] = [
  { id: "overview", label: "Tổng quan", icon: BarChart3 },
  { id: "compose", label: "Soạn & đăng", icon: FileText },
  { id: "posts", label: "Lịch sử", icon: Play },
  { id: "trends", label: "Xu hướng", icon: Flame },
  { id: "policy", label: "Chính sách", icon: ShieldCheck },
];
const STATUS_LABEL: Record<TkPost["status"], string> = {
  draft: "Bản nháp", submitted: "Đã gửi", processing: "Đang xử lý",
  reviewing: "Chờ duyệt", published: "Đã đăng", failed: "Thất bại",
};
const BEST_TIMES = [
  "7h00 – 9h00: lúc bắt đầu ngày mới, người dùng lướt nhanh.",
  "12h00 – 13h30: giờ nghỉ trưa, mật độ xem cao.",
  "19h30 – 22h00: khung giờ vàng, cạnh tranh nhiều nhất.",
  "Cuối tuần 10h00 – 12h00: khán giả trẻ xem dài hơn.",
  "Tránh đăng dồn nhiều video cùng lúc; cách nhau ít nhất 3 giờ.",
];

type Media = { file: File; width: number | null; height: number | null; seconds: number | null };

function readMedia(file: File): Promise<Media> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => resolve({ file, width: video.videoWidth || null, height: video.videoHeight || null, seconds: Number.isFinite(video.duration) ? video.duration : null });
    video.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Không đọc được video. Hãy dùng định dạng MP4.")); };
    video.src = url;
  });
}

export function TikTokView({ data, onNavigate, notify }: {
  data: WorkspaceData;
  onNavigate: (view: View, route?: { tab?: string; videoId?: string; planId?: string }) => void;
  notify: (message: string, error?: boolean) => void;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [status, setStatus] = useState<TkStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<TkOverview | null>(null);
  const [overviewError, setOverviewError] = useState("");
  const [posts, setPosts] = useState<TkPost[]>([]);
  const [title, setTitle] = useState("");
  const [media, setMedia] = useState<Media | null>(null);
  const [privacyLevel, setPrivacyLevel] = useState<TkPrivacy>("SELF_ONLY");
  const [mode, setMode] = useState<"direct" | "inbox">("direct");
  const [disableComment, setDisableComment] = useState(false);
  const [disableDuet, setDisableDuet] = useState(false);
  const [disableStitch, setDisableStitch] = useState(false);
  const [coverMs, setCoverMs] = useState(1000);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [blocked, setBlocked] = useState<{ id: string; message: string; fix: string }[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [prefill, setPrefill] = useState<{ title: string; sourceLabel: string } | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/tiktok/status", { cache: "no-store" });
      if (response.ok) setStatus((await response.json()) as TkStatus);
    } finally { setLoading(false); }
  }, []);
  const loadPosts = useCallback(async () => {
    const response = await fetch("/api/tiktok/posts", { cache: "no-store" });
    if (response.ok) setPosts((await response.json()) as TkPost[]);
  }, []);
  const loadOverview = useCallback(async () => {
    setOverviewError("");
    const response = await fetch("/api/tiktok/overview", { cache: "no-store" });
    const body = (await response.json().catch(() => ({}))) as TkOverview & { error?: string };
    if (!response.ok) { setOverview(null); setOverviewError(body.error || "Không đọc được dữ liệu TikTok."); return; }
    setOverview(body);
  }, []);

  useEffect(() => {
    void loadStatus();
    const url = new URL(window.location.href);
    const requested = url.searchParams.get("tab");
    if (requested === "compose") setTab("compose");
    const videoId = url.searchParams.get("video");
    const video = videoId ? data.videos.find((item) => item.id === videoId) : null;
    if (video) {
      setPrefill({ title: `${video.title}\n\n${video.description}`.trim().slice(0, 1500), sourceLabel: `Từ video YouTube: ${video.title.slice(0, 40)}` });
      setTab("compose");
    }
    // One-shot initial routing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!status?.connected) return;
    if (tab === "overview") void loadOverview().catch(() => setOverviewError("Không kết nối được tới TikTok."));
    if (tab === "compose" || tab === "posts" || tab === "policy") void loadPosts();
    if (tab === "trends") void loadOverview().catch(() => undefined);
  }, [tab, status?.connected, loadOverview, loadPosts]);

  useEffect(() => {
    if (prefill) setTitle(prefill.title);
  }, [prefill]);

  const report = useMemo(() => analyzeTikTok({
    title,
    privacyLevel,
    hasMedia: !!media,
    width: media?.width ?? null,
    height: media?.height ?? null,
    seconds: media?.seconds ?? null,
    bytes: media?.file.size ?? null,
    disableComment,
    disableDuet,
    disableStitch,
  }), [title, media, privacyLevel, disableComment, disableDuet, disableStitch]);

  const assistant = useMemo(() => buildTikTokAssistant({
    title, privacyLevel, hasMedia: !!media, width: media?.width ?? null, height: media?.height ?? null,
    seconds: media?.seconds ?? null, bytes: null, disableComment, disableDuet, disableStitch,
  }, report, status?.account?.displayName || data.channel?.title || "Kênh TikTok"), [title, media, privacyLevel, report, status?.account?.displayName, data.channel?.title, disableComment, disableDuet, disableStitch]);

  const hashtags = extractHashtags(title);

  async function pickFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("video/")) { notify("TikTok chỉ nhận video. Hãy dùng tệp MP4.", true); return; }
    if (file.size > TK_LIMITS.maxBytes) { notify("Tệp vượt 4GB, hãy nén lại.", true); return; }
    try { setMedia(await readMedia(file)); setBlocked([]); }
    catch (error) { notify(error instanceof Error ? error.message : "Không đọc được video", true); }
  }

  async function submit() {
    if (!title.trim()) { notify("Hãy viết chú thích cho video.", true); return; }
    if (mode !== "inbox" && !report.readyToPublish) {
      setBlocked(report.blockers.map((item) => ({ id: item.id, message: item.message, fix: item.fix })));
      notify(`Còn ${report.blockers.length} lỗi chặn theo Nguyên tắc cộng đồng.`, true);
      return;
    }
    if (!media) { notify("Hãy chọn video để đăng.", true); return; }
    setSubmitting(true);
    setBlocked([]);
    try {
      const form = new FormData();
      form.set("mode", mode);
      form.set("title", title);
      form.set("privacyLevel", privacyLevel);
      form.set("notes", notes);
      form.set("coverTimestampMs", String(coverMs));
      form.set("disableComment", disableComment ? "1" : "0");
      form.set("disableDuet", disableDuet ? "1" : "0");
      form.set("disableStitch", disableStitch ? "1" : "0");
      form.set("file", media.file, media.file.name);
      if (media.width) form.set("width", String(media.width));
      if (media.height) form.set("height", String(media.height));
      if (media.seconds) form.set("mediaDuration", String(Math.round(media.seconds)));
      const response = await fetch("/api/tiktok/posts", { method: "POST", body: form });
      const body = (await response.json().catch(() => ({}))) as TkPost & { error?: string; findings?: { id: string; message: string; fix?: string }[] };
      if (response.status === 422 && body.findings) {
        setBlocked(body.findings.map((item) => ({ id: item.id, message: item.message, fix: item.fix ?? "" })));
        notify(body.error || "Còn lỗi chặn.", true);
        return;
      }
      if (!response.ok) { notify(body.error || "Không đăng được video.", true); return; }
      notify(mode === "inbox" ? "Đã gửi video vào hộp thư TikTok. Mở ứng dụng TikTok để hoàn tất đăng." : "Đã gửi video lên TikTok. TikTok sẽ xử lý và có thể đưa vào hàng chờ kiểm duyệt.");
      setTitle(""); setMedia(null); setNotes("");
      await loadPosts();
      setTab("posts");
    } catch { notify("Mất kết nối khi gửi. Nội dung vẫn còn trong form, hãy thử lại.", true); }
    finally { setSubmitting(false); }
  }

  async function checkStatus(post: TkPost) {
    try {
      const response = await fetch(`/api/tiktok/posts/${post.id}/check`, { method: "POST" });
      const body = (await response.json().catch(() => ({}))) as TkPost & { remoteStatus?: string; error?: string };
      if (!response.ok) { notify(body.error || "Không kiểm tra được trạng thái.", true); return; }
      notify(`Trạng thái TikTok: ${body.remoteStatus ?? body.status}.`);
      await loadPosts();
    } catch (error) { notify(error instanceof Error ? error.message : "Không kiểm tra được.", true); }
  }

  async function remove(post: TkPost) {
    if (!window.confirm("Xoá mục này khỏi TubeFlow?")) return;
    const response = await fetch(`/api/tiktok/posts/${post.id}`, { method: "DELETE" });
    const body = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
    if (!response.ok) { notify(body.error || "Không xoá được.", true); return; }
    notify(body.message || "Đã xoá.");
    await loadPosts();
  }

  async function pushToYouTube() {
    if (!title.trim()) { notify("Viết chú thích trước khi chuyển sang YouTube.", true); return; }
    try {
      const response = await fetch("/api/facebook/adapt", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: title, kind: "video", pageName: status?.account?.displayName || "TikTok" }),
      });
      const body = (await response.json().catch(() => ({}))) as { planId?: string; error?: string };
      if (!response.ok || !body.planId) throw new Error(body.error || "Không chuyển được.");
      notify("Đã tạo kế hoạch YouTube từ nội dung TikTok. Mở phần đăng video…");
      onNavigate("studio", { tab: "upload", planId: body.planId });
    } catch (error) { notify(error instanceof Error ? error.message : "Không chuyển được", true); }
  }

  if (loading) return <div className="fb-loading"><Loader2 size={26} className="spin" /><p>Đang tải không gian TikTok…</p></div>;

  const account = status?.account ?? null;
  const connected = !!status?.connected;

  return (
    <div className="fb-workspace tiktok-workspace">
      <PlatformSwitch current="tiktok" onNavigate={onNavigate} youtubeConnected={!!data.channel} />

      <header className="fb-hero tiktok-hero">
        <div className="fb-hero-copy">
          <span className="fb-eyebrow"><Music4 size={13} />TIKTOK CREATOR</span>
          <h1>{account ? account.displayName || account.username : "Kết nối TikTok"}</h1>
          <p>{account ? `@${account.username || "—"} · ${formatNumber(account.followerCount)} người theo dõi · ${formatNumber(account.videoCount)} video · ${formatNumber(account.likesCount)} lượt thích` : "Đăng video, kiểm tra Nguyên tắc cộng đồng và tối ưu khả năng lên xu hướng từ cùng không gian sáng tạo."}</p>
        </div>
        <div className="fb-hero-actions">
          {connected && <span className={`fb-status-pill ${status?.reconnectRequired ? "warn" : "ok"}`}>{status?.reconnectRequired ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}{status?.reconnectRequired ? "Cần kết nối lại" : "Đã kết nối"}</span>}
          <button type="button" className="fb-button primary" disabled={!connected} onClick={() => setTab("compose")}><Plus15 />Soạn video</button>
        </div>
      </header>

      {!connected || status?.reconnectRequired ? (
        <section className="fb-connect-hero tiktok-connect-hero">
          <div className="fb-connect-art" aria-hidden="true"><Music4 size={34} /><span /></div>
          <div>
            <h2>{status?.reconnectRequired ? "Kết nối TikTok đã hết hạn" : "Chưa kết nối tài khoản TikTok"}</h2>
            <p>TikTok Login Kit cấp token trong 24 giờ; TubeFlow tự làm mới và lưu token đã mã hoá. Kết nối tại trang Kết nối kênh, cùng chỗ YouTube và Facebook.</p>
            <div className="fb-connect-actions"><button type="button" className="fb-button primary" onClick={() => onNavigate("connections")}><Link2 size={15} />Đi tới Kết nối kênh</button></div>
          </div>
        </section>
      ) : null}

      <nav className="fb-tabs" aria-label="Khu vực TikTok">
        {TABS.map((item) => { const Icon = item.icon; return (
          <button key={item.id} type="button" aria-pressed={tab === item.id} className={tab === item.id ? "is-active" : ""} onClick={() => setTab(item.id)} disabled={!connected && item.id !== "compose"}>
            <Icon size={15} />{item.label}
          </button>); })}
      </nav>

      {tab === "overview" && connected && (
        <div className="fb-grid-two">
          <section className="fb-card">
            <header className="fb-card-head"><div><h2>Hồ sơ TikTok</h2><p>Đọc từ Display API</p></div><button type="button" className="fb-icon-button" onClick={() => void loadOverview()} aria-label="Làm mới"><RefreshCw size={15} /></button></header>
            {overviewError ? <p className="fb-error-text">{overviewError}</p> : (
              <div className="fb-stats">
                <div><Music4 size={18} /><strong>{formatNumber(account?.followerCount ?? 0)}</strong><span>Người theo dõi</span></div>
                <div><Play size={18} /><strong>{formatNumber(account?.videoCount ?? 0)}</strong><span>Video</span></div>
                <div><Sparkles size={18} /><strong>{formatNumber(account?.likesCount ?? 0)}</strong><span>Lượt thích</span></div>
              </div>
            )}
          </section>
          <section className="fb-card">
            <header className="fb-card-head"><div><h2>Khả năng phân phối</h2><p>Điều kiện để video được xem</p></div></header>
            <ul className="fb-checklist">
              <li className={status?.canPublish ? "pass" : "todo"}>{status?.canPublish ? <CheckCircle2 size={15} /> : <span className="fb-dot" />}<span>Quyền <code>video.publish</code> — đăng thẳng lên hồ sơ</span></li>
              <li className={status?.canUpload ? "pass" : "todo"}>{status?.canUpload ? <CheckCircle2 size={15} /> : <span className="fb-dot" />}<span>Quyền <code>video.upload</code> — gửi vào hộp thư TikTok</span></li>
              <li className={privacyLevel === "SELF_ONLY" ? "todo" : "pass"}><span className="fb-dot" />{privacyLevel === "SELF_ONLY" ? <span>Ứng dụng chưa qua kiểm duyệt: TikTok ép đăng ở chế độ Chỉ mình tôi.</span> : <span>Chế độ hiển thị công khai đang được phép.</span>}</li>
            </ul>
            <button type="button" className="fb-button primary" onClick={() => setTab("compose")}><Play size={14} />Bắt đầu đăng video</button>
          </section>
          <section className="fb-card fb-span-2">
            <header className="fb-card-head"><div><h2>Video gần đây trên TikTok</h2><p>Danh sách do TikTok trả về</p></div></header>
            {overview?.videos.length ? (
              <ul className="fb-feed">
                {overview.videos.map((video) => (
                  <li key={video.id}>
                    <div><p>{video.title}</p><small>{video.createTime ? new Date(Number(video.createTime) * (video.createTime.length === 10 ? 1000 : 1)).toLocaleDateString("vi-VN") : "—"}{video.duration ? ` · ${video.duration}s` : ""}</small></div>
                    <div className="fb-feed-metrics"><span>{formatNumber(video.likeCount)} thích</span><span>{formatNumber(video.commentCount)} bình luận</span><span>{formatNumber(video.viewCount)} xem</span></div>
                    {video.shareUrl && <a href={video.shareUrl} target="_blank" rel="noopener noreferrer" className="fb-icon-button" aria-label="Mở trên TikTok"><ExternalLink size={14} /></a>}
                  </li>
                ))}
              </ul>
            ) : <p className="fb-muted">Chưa đọc được video nào từ tài khoản.</p>}
          </section>
        </div>
      )}

      {tab === "compose" && connected && (
        <div className="fb-composer">
          <section className="fb-card fb-compose-main">
            <header className="fb-card-head">
              <div><h2>Soạn video TikTok</h2><p>Chú thích, hashtag và quy tắc cộng đồng được kiểm tra trước khi gửi.</p></div>
              {prefill?.sourceLabel && <span className="fb-source-chip"><Play size={14} />{prefill.sourceLabel}</span>}
            </header>

            <div className="fb-media-zone">
              <input ref={fileRef} type="file" hidden accept="video/*" onChange={(event) => { void pickFile(event.target.files?.[0]); event.target.value = ""; }} />
              {media ? (
                <div className="fb-media-preview">
                  <video src={URL.createObjectURL(media.file)} controls playsInline muted />
                  <div>
                    <strong>{media.file.name}</strong>
                    <small>{media.width && media.height ? `${media.width}×${media.height}` : "Không đọc được kích thước"}{media.seconds ? ` · ${Math.round(media.seconds)} giây` : ""} · {(media.file.size / 1024 / 1024).toFixed(1)} MB</small>
                    <button type="button" className="fb-link-button" onClick={() => setMedia(null)}><X size={13} />Bỏ video này</button>
                  </div>
                </div>
              ) : (
                <button type="button" className="fb-dropzone" onClick={() => fileRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void pickFile(event.dataTransfer.files[0]); }}>
                  <Upload size={22} /><strong>Chọn video hoặc kéo thả vào đây</strong><small>Lý tưởng: MP4, dọc 9:16 (1080×1920), 21–34 giây</small>
                </button>
              )}
            </div>

            <label className="fb-field">
              <span>Chú thích <em>{title.length}/{TK_LIMITS.titleMax} · {hashtags.length} hashtag</em></span>
              <textarea rows={6} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Câu đầu nêu ngay giá trị. Thêm 3–4 hashtag liên quan…" />
            </label>

            <div className="fb-preview">
              <span className="fb-preview-label">Hiển thị trên màn hình (90 ký tự đầu)</span>
              <p>{report.hookPreview || <em>Chú thích sẽ hiện ở đây.</em>}{title.length > TK_LIMITS.hookChars && <span className="fb-muted"> …</span>}</p>
            </div>

            <label className="fb-field">
              <span>Chế độ hiển thị</span>
              <select value={privacyLevel} onChange={(event) => setPrivacyLevel(event.target.value as TkPrivacy)}>
                {TK_PRIVACY.filter((item) => status?.privacyOptions.length ? status.privacyOptions.includes(item.id) : true).map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
              <small className="fb-muted">{TK_PRIVACY.find((item) => item.id === privacyLevel)?.note}</small>
            </label>
            {privacyLevel === "SELF_ONLY" && (
              <div className="fb-attest"><AlertTriangle size={16} /><span>Video đang ở chế độ <b>Chỉ mình tôi</b>. Ứng dụng chưa qua kiểm duyệt của TikTok sẽ luôn bị giới hạn như vậy — hãy gửi ứng dụng đi kiểm duyệt để đăng công khai.</span></div>
            )}

            <div className="fb-schedule-row">
              <div className="fb-segment" role="group" aria-label="Cách đăng">
                <button type="button" aria-pressed={mode === "direct"} className={mode === "direct" ? "is-active" : ""} onClick={() => setMode("direct")} disabled={!status?.canPublish}><Play size={14} />Đăng thẳng lên hồ sơ</button>
                <button type="button" aria-pressed={mode === "inbox"} className={mode === "inbox" ? "is-active" : ""} onClick={() => setMode("inbox")} disabled={!status?.canUpload}><Upload size={14} />Gửi vào hộp thư</button>
              </div>
              <label className="fb-field fb-field-inline">
                <span>Ảnh bìa (mili giây)</span>
                <input type="number" min={0} step={250} value={coverMs} onChange={(event) => setCoverMs(Math.max(0, Number(event.target.value) || 0))} />
              </label>
            </div>

            <div className="fb-check-row">
              <label className="fb-attest"><input type="checkbox" checked={disableComment} onChange={(event) => setDisableComment(event.target.checked)} /><span>Tắt bình luận</span></label>
              <label className="fb-attest"><input type="checkbox" checked={disableDuet} onChange={(event) => setDisableDuet(event.target.checked)} /><span>Tắt Duet</span></label>
              <label className="fb-attest"><input type="checkbox" checked={disableStitch} onChange={(event) => setDisableStitch(event.target.checked)} /><span>Tắt Stitch</span></label>
            </div>

            <label className="fb-field">
              <span>Ghi chú nội bộ (không đăng lên TikTok)</span>
              <input value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={300} placeholder="VD: đăng sau khi có kết quả quay lại…" />
            </label>

            {blocked.length > 0 && (
              <div className="fb-blocked" role="alert">
                <strong><AlertTriangle size={16} />TikTok sẽ gỡ hoặc hạn chế video này</strong>
                <ul>{blocked.map((item) => <li key={item.id}>{item.message}{item.fix && <em> → {item.fix}</em>}</li>)}</ul>
              </div>
            )}

            <footer className="fb-submit-bar">
              <span className={`fb-readiness ${report.readyToPublish ? "ok" : "bad"}`}>
                {report.readyToPublish ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
                {report.readyToPublish ? "Sẵn sàng" : `${report.blockers.length} lỗi chặn`} · {report.score}/100 · Trend {report.trendScore}%
              </span>
              <button type="button" className="fb-button primary" disabled={submitting || !media || !title.trim()} onClick={() => void submit()}>
                {submitting ? <Loader2 size={15} className="spin" /> : <Upload size={15} />}
                {mode === "inbox" ? "Gửi vào hộp thư TikTok" : "Đăng lên TikTok"}
              </button>
            </footer>
          </section>

          <aside className="fb-compose-side">
            <section className="fb-card">
              <header className="fb-card-head compact"><div><h3><ShieldCheck size={16} />Nguyên tắc cộng đồng</h3><p>{report.findings.length ? `${report.findings.length} lưu ý` : "Không có cảnh báo"}</p></div><span className={`fb-grade ${report.grade.startsWith("A") ? "good" : report.grade === "D" ? "bad" : "warn"}`}>{report.score}</span></header>
              <ul className="fb-checklist">
                {report.checklist.map((item) => (
                  <li key={item.id} className={item.state}>
                    {item.state === "pass" ? <CheckCircle2 size={15} /> : item.state === "fail" ? <AlertTriangle size={15} /> : <span className="fb-dot" />}
                    <span>{item.label}{item.detail && <em> · {item.detail}</em>}</span>
                  </li>
                ))}
              </ul>
              {report.findings.length > 0 && (
                <ul className="fb-findings">
                  {report.findings.map((finding) => (
                    <li key={finding.id} className={finding.level}>
                      <strong>{finding.area}</strong><span>{finding.message}</span>
                      {finding.fix && <em>Cách sửa: {finding.fix}</em>}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="fb-card">
              <header className="fb-card-head compact"><div><h3><Sparkles size={16} />Trợ lý nội dung</h3><p>Sẵn sàng lên xu hướng: {report.trendScore}%</p></div></header>
              <div className="fb-assist-block">
                <span className="fb-assist-title">Mở đầu (hook)</span>
                {assistant.hooks.map((hook) => <button key={hook} type="button" className="fb-chip-button" onClick={() => setTitle((current) => (!current.trim() ? hook : `${current.trimEnd()}\n\n${hook}`).slice(0, TK_LIMITS.titleMax))}>{hook}</button>)}
              </div>
              <div className="fb-assist-block">
                <span className="fb-assist-title">Hashtag gợi ý</span>
                <div className="fb-tags">{assistant.hashtags.map((tag) => <button key={tag} type="button" className="fb-tag" onClick={() => setTitle((current) => `${current} ${tag}`.trim().slice(0, TK_LIMITS.titleMax))}>{tag}</button>)}</div>
              </div>
              <div className="fb-assist-block">
                <span className="fb-assist-title">Nhịp video 30 giây</span>
                <ol className="fb-outline">{assistant.pacing.map((step) => <li key={step.time}><b>{step.time}</b> {step.label}</li>)}</ol>
              </div>
              <div className="fb-assist-actions">
                <button type="button" className="fb-button" onClick={() => { void navigator.clipboard?.writeText(assistant.notes); notify("Đã sao chép ghi chú đăng TikTok."); }}><Copy size={14} />Sao chép ghi chú</button>
                <button type="button" className="fb-button youtube" onClick={() => void pushToYouTube()}><Play size={14} />Chuyển sang YouTube</button>
              </div>
            </section>
          </aside>
        </div>
      )}

      {tab === "posts" && connected && (
        <section className="fb-card">
          <header className="fb-card-head"><div><h2>Lịch sử đăng TikTok</h2><p>{posts.length} mục · gửi tới Content Posting API</p></div><button type="button" className="fb-button" onClick={() => setTab("compose")}><Upload size={14} />Video mới</button></header>
          {posts.length === 0 ? (
            <div className="fb-empty"><Music4 size={28} /><h3>Chưa có video nào</h3><p>Soạn video đầu tiên để kiểm tra chính sách và đăng.</p></div>
          ) : (
            <ul className="fb-post-list">
              {posts.map((post) => (
                <li key={post.id} className={`fb-post-row status-${post.status === "published" ? "published" : post.status === "failed" ? "failed" : post.status === "draft" ? "draft" : "scheduled"}`}>
                  <span className="fb-post-kind">{post.mode === "inbox" ? "Hộp thư" : "Trực tiếp"}</span>
                  <div className="fb-post-body">
                    <p>{post.title || <em>{post.mediaName || "Không có chú thích"}</em>}</p>
                    <small>
                      <span className={`fb-status-badge ${post.status === "published" ? "published" : post.status === "failed" ? "failed" : post.status === "draft" ? "draft" : "scheduled"}`}>{STATUS_LABEL[post.status]}</span>
                      {post.mediaName && <> · {post.mediaName}</>}
                      {post.mediaDuration ? <> · {Math.round(post.mediaDuration)}s</> : null}
                    </small>
                    {post.error && <small className="fb-error-text">Lỗi: {post.error}</small>}
                  </div>
                  <span className={`fb-grade ${post.policyGrade.startsWith("A") ? "good" : post.policyGrade === "D" ? "bad" : "warn"}`}>{post.policyScore}</span>
                  <div className="fb-row-actions">
                    {(post.status === "submitted" || post.status === "processing" || post.status === "reviewing") && (
                      <button type="button" className="fb-icon-button" onClick={() => void checkStatus(post)} aria-label="Kiểm tra trạng thái"><Clock3 size={14} /></button>
                    )}
                    {post.status !== "published" && <button type="button" className="fb-icon-button danger" onClick={() => void remove(post)} aria-label="Xoá"><Trash2 size={14} /></button>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === "trends" && connected && (
        <div className="fb-grid-two">
          <section className="fb-card">
            <header className="fb-card-head"><div><h2><Flame size={16} />Ý tưởng dễ lên xu hướng</h2><p>Gợi ý theo định dạng ngắn của TikTok</p></div></header>
            <ul className="fb-rules">
              {assistant.trendIdeas.map((idea) => (
                <li key={idea}><Sparkles size={14} /><div><span>{idea}</span></div></li>
              ))}
            </ul>
          </section>
          <section className="fb-card">
            <header className="fb-card-head"><div><h2><Clock3 size={16} />Khung giờ đăng</h2><p>Theo khán giả Việt Nam</p></div></header>
            <ul className="fb-rules">
              {BEST_TIMES.map((line) => <li key={line}><CheckCircle2 size={14} /><div><span>{line}</span></div></li>)}
            </ul>
            <p className="fb-muted fb-disclaimer">Đây là gợi ý từ tập quán chung, không phải cam kết từ TikTok. Hãy theo dõi chỉ số của chính kênh để điều chỉnh.</p>
          </section>
        </div>
      )}

      {tab === "policy" && connected && (
        <div className="fb-grid-two">
          <section className="fb-card">
            <header className="fb-card-head"><div><h2>Nguyên tắc cần nhớ</h2><p>Vi phạm phổ biến dẫn tới gỡ video và hạn chế tài khoản</p></div></header>
            <ul className="fb-rules">
              {[
                { t: "Nội dung người lớn", d: "Nghiêm cấm mọi nội dung khiêu dâm, khoả thân hoặc khiêu dâm hoá." },
                { t: "Bạo lực & gây sốc", d: "Không đăng cảnh bạo lực, máu me, hành hạ." },
                { t: "Thù ghét & quấy rối", d: "Không công kích, đe doạ hay kêu gọi tấn công cá nhân/nhóm người." },
                { t: "Hành vi nguy hiểm", d: "Không hướng dẫn hay thao diễn hành động nguy hiểm, thử thách mạo hiểm." },
                { t: "Trung thực & xác thực", d: "Không tung tin giả, không dùng tài khoản giả, không tái đăng nội dung của người khác." },
                { t: "An toàn trẻ em", d: "TikTok xử lý rất nghiêm khắc với mọi nội dung liên quan tới trẻ em." },
                { t: "Gian lận tương tác", d: "Không mua/bán like, view, follower; không thao túng thuật toán." },
              ].map((rule) => <li key={rule.t}><ShieldCheck size={14} /><div><strong>{rule.t}</strong><span>{rule.d}</span></div></li>)}
            </ul>
            <p className="fb-muted fb-disclaimer">Kiểm tra của TubeFlow là bước sàng lọc sớm dựa trên luật công bố. Quyết định cuối cùng thuộc về TikTok.</p>
          </section>
          <section className="fb-card">
            <header className="fb-card-head"><div><h2>Cảnh báo từ lịch sử soạn bài</h2><p>Các lỗi thường lặp lại</p></div></header>
            {(() => {
              const counts = new Map<string, number>();
              for (const post of posts) for (const finding of post.policyFindings) counts.set(finding.area, (counts.get(finding.area) ?? 0) + 1);
              const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
              return rows.length ? (
                <ul className="fb-bars">{rows.map(([area, count]) => (
                  <li key={area}><span>{area}</span><div><i style={{ width: `${Math.min(100, count * 25)}%` }} /></div><strong>{count}</strong></li>
                ))}</ul>
              ) : <p className="fb-muted">Chưa có cảnh báo nào. Các video soạn sau sẽ được tổng hợp tại đây.</p>;
            })()}
          </section>
        </div>
      )}

      {!connected && tab !== "compose" && (
        <section className="fb-card"><p className="fb-error-text">Hãy kết nối TikTok tại trang Kết nối kênh để dùng các chức năng này.</p></section>
      )}
    </div>
  );
}

function Plus15() {
  return <Upload size={15} />;
}
