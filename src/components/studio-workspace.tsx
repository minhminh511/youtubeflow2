"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Share2, AlertTriangle, ArrowRight, BarChart3, CheckCircle2, Clapperboard, Download, ExternalLink, Eye, Film, Link2, Loader2, MessageSquare, Play, RefreshCw, ShieldCheck, Sparkles, ThumbsUp, Upload, Users, X } from "lucide-react";
import { CopyButton, downloadText } from "@/components/ui";
import { PlatformSwitch } from "@/components/platform-switch";
import { formatDate, formatNumber, requestJson } from "@/lib/client";
import { analyzeMetadata, buildAssistant, LIMITS, type MetadataDraft, type PolicyReport } from "@/lib/policy";
import type { AnalyticsData, Plan, PublicConfig, StudioVideo, VideoAnalyticsRow, VideoComment, View, WorkspaceData } from "@/lib/types";

type Props = {
  data: WorkspaceData;
  config: PublicConfig;
  onNavigate: (view: View, route?: { tab?: string; videoId?: string; planId?: string }) => void;
  onPlansChange: (plans: Plan[]) => void;
  onVideosChange: (videos: StudioVideo[]) => void;
  notify: (message: string, error?: boolean) => void;
};
type Tab = "dashboard" | "videos" | "upload" | "policy" | "comments" | "analytics" | "sync";
type PublicVideo = { videoId: string; title: string; thumbnail: string | null; duration: string | null; views: string | null; published: string | null; url: string };
type PublicChannel = { handle: string; channelId: string | null; title: string; thumbnail: string | null; subscribers: string | null; videoCount: string | null; views: string | null; description: string | null; url: string; videos: PublicVideo[] };
type Scored = { key: string; id: string | null; youtubeVideoId: string | null; title: string; thumbnail: string | null; meta: string; source: "youtube" | "public"; report: PolicyReport; draft: MetadataDraft };

const DEFAULT_HANDLE = "@HangulMinh";
const TABS: { id: Tab; label: string; icon: typeof Film }[] = [
  { id: "dashboard", label: "Bảng điều khiển", icon: Clapperboard },
  { id: "videos", label: "Nội dung", icon: Film },
  { id: "upload", label: "Đăng & tối ưu", icon: Upload },
  { id: "policy", label: "Trung tâm chính sách", icon: ShieldCheck },
  { id: "comments", label: "Bình luận", icon: MessageSquare },
  { id: "analytics", label: "Phân tích", icon: BarChart3 },
  { id: "sync", label: "Đồng bộ kênh", icon: Link2 },
];
const CATEGORIES = [
  { id: "22", label: "Mọi người & Blog" }, { id: "24", label: "Giải trí" }, { id: "26", label: "Bí quyết & Phong cách" },
  { id: "27", label: "Giáo dục" }, { id: "28", label: "Khoa học & Công nghệ" }, { id: "20", label: "Trò chơi" },
  { id: "17", label: "Thể thao" }, { id: "19", label: "Du lịch & Sự kiện" }, { id: "23", label: "Hài kịch" },
];

/** ISO 8601 (PT1H2M3S) hoặc đồng hồ (12:34 / 1:02:03) → giây. */
function toSeconds(value: string | null): number | null {
  if (!value) return null;
  const iso = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value);
  if (iso) return Number(iso[1] || 0) * 3600 + Number(iso[2] || 0) * 60 + Number(iso[3] || 0);
  const parts = value.split(":").map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part))) return null;
  return parts.reduce((total, part) => total * 60 + part, 0);
}
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
const gradeColor = (grade: string) => grade.startsWith("A") ? "bg-emerald-50 text-emerald-700 border-emerald-200" : grade === "B" ? "bg-sky-50 text-sky-700 border-sky-200" : grade === "C" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-rose-50 text-rose-700 border-rose-200";

export function StudioWorkspace({ data, config, onNavigate, onPlansChange, onVideosChange, notify }: Props) {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [requestedVideo, setRequestedVideo] = useState<string | null>(null);
  const [requestedPlan, setRequestedPlan] = useState<string | null>(null);

  useEffect(() => {
    const readRoute = () => {
      const params = new URL(window.location.href).searchParams;
      const requestedTab = params.get("tab");
      if (TABS.some((entry) => entry.id === requestedTab)) setTab(requestedTab as Tab);
      setRequestedVideo(params.get("video"));
      setRequestedPlan(params.get("plan"));
    };
    readRoute();
    window.addEventListener("popstate", readRoute);
    window.addEventListener("tubeflow:studio-route", readRoute);
    return () => {
      window.removeEventListener("popstate", readRoute);
      window.removeEventListener("tubeflow:studio-route", readRoute);
    };
  }, []);
  const [handle, setHandle] = useState(DEFAULT_HANDLE);
  const [handleInput, setHandleInput] = useState(DEFAULT_HANDLE);
  const [publicChannel, setPublicChannel] = useState<PublicChannel | null>(null);
  const [publicVideos, setPublicVideos] = useState<PublicVideo[]>([]);
  const [publicError, setPublicError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [videos, setVideos] = useState<StudioVideo[]>(data.videos);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Scored | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagText, setTagText] = useState("");
  const [privacy, setPrivacy] = useState("private");
  const [kind, setKind] = useState<"video" | "short">("video");
  const [publishAt, setPublishAt] = useState("");
  const [categoryId, setCategoryId] = useState("26");
  const [madeForKids, setMadeForKids] = useState(false);
  const [paidPromotion, setPaidPromotion] = useState(false);
  const [hasCaptions, setHasCaptions] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [comments, setComments] = useState<VideoComment[]>([]);
  const [commentTarget, setCommentTarget] = useState<string>("");
  const [loadingComments, setLoadingComments] = useState(false);
  const [report30, setReport30] = useState<AnalyticsData | null>(null);
  const [videoRows, setVideoRows] = useState<VideoAnalyticsRow[]>([]);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [savingNotes, setSavingNotes] = useState<string | null>(null);

  // A Facebook draft arrives as a plan id: pre-fill the upload form once, and only once per plan.
  const [prefilledPlan, setPrefilledPlan] = useState<string | null>(null);
  if (requestedPlan && requestedPlan !== prefilledPlan) {
    const planToUpload = data.plans.find((item) => item.id === requestedPlan);
    if (planToUpload) {
      setPrefilledPlan(requestedPlan);
      setTab("upload");
      setTitle(planToUpload.title.slice(0, LIMITS.title));
      setDescription(planToUpload.description.slice(0, LIMITS.description));
      setKind(planToUpload.format === "short" ? "short" : "video");
    }
  }

  const channel = data.channel;
  const channelTitle = channel?.title || publicChannel?.title || handle;

  const fetchPublic = useCallback(async (target: string, quiet = false) => {
    setSyncing(true); setPublicError("");
    try {
      const result = await requestJson<{ channel: PublicChannel; fetchedAt: string }>(`/api/youtube/channel?handle=${encodeURIComponent(target)}&videos=1`);
      setPublicChannel(result.channel);
      setPublicVideos(result.channel.videos || []);
      setLastSync(result.fetchedAt);
      if (!quiet) notify(`Đã đồng bộ công khai ${result.channel.title}: ${result.channel.videos?.length ?? 0} video, ${result.channel.subscribers ?? "?"} người đăng ký.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không đồng bộ được kênh";
      setPublicError(message);
      if (!quiet) notify(message, true);
    } finally { setSyncing(false); }
  }, [notify]);

  useEffect(() => {
    let stored = DEFAULT_HANDLE;
    try { stored = window.localStorage.getItem("tubeflow.handle") || DEFAULT_HANDLE; } catch { /* chế độ ẩn danh */ }
    setHandle(stored); setHandleInput(stored);
    void fetchPublic(stored, true);
  }, [fetchPublic]);

  useEffect(() => { setVideos(data.videos); }, [data.videos]);

  async function syncEverything() {
    await fetchPublic(handle);
    if (channel) {
      try {
        const payload = await requestJson<unknown>("/api/youtube/sync", { method: "POST" });
        const list = (payload as { videos?: StudioVideo[] }).videos;
        if (Array.isArray(list)) { setVideos(list); onVideosChange(list); notify(`Đã đồng bộ ${list.length} video qua OAuth.`); }
        else notify("Đã làm mới dữ liệu kênh qua OAuth.");
      } catch (error) { notify(error instanceof Error ? error.message : "Đồng bộ OAuth thất bại", true); }
    }
  }

  function bindHandle() {
    const next = handleInput.trim().startsWith("@") ? handleInput.trim() : `@${handleInput.trim().replace(/^\/+/, "")}`;
    if (next.length < 3) { notify("Handle kênh không hợp lệ.", true); return; }
    setHandle(next); setHandleInput(next);
    try { window.localStorage.setItem("tubeflow.handle", next); } catch { /* bỏ qua */ }
    void fetchPublic(next);
  }

  const scored = useMemo<Scored[]>(() => {
    const fromYoutube: Scored[] = videos.map((video) => {
      const seconds = toSeconds(video.duration);
      const draft: MetadataDraft = {
        kind: seconds && seconds > 0 && seconds <= LIMITS.shortSeconds ? "short" : "video",
        title: video.title, description: video.description, tags: video.tags || [],
        categoryId: video.categoryId || "", madeForKids: video.madeForKids, privacyStatus: video.privacyStatus,
        paidPromotion: false, language: "vi", hasCaptions: false, durationSeconds: seconds,
        thumbnail: video.thumbnail ? { width: 1280, height: 720, bytes: 0 } : null,
        handle,
      };
      return { key: `yt-${video.id}`, id: video.id, youtubeVideoId: video.youtubeVideoId, title: video.title, thumbnail: video.thumbnail, meta: `${video.privacyStatus} · ${video.duration ? clock(seconds ?? 0) : "?"} · ${formatNumber(video.viewCount)} lượt xem`, source: "youtube" as const, report: analyzeMetadata(draft), draft };
    });
    const seen = new Set(fromYoutube.map((item) => item.youtubeVideoId));
    const fromPublic: Scored[] = publicVideos.filter((video) => !seen.has(video.videoId)).map((video) => {
      const seconds = toSeconds(video.duration);
      const draft: MetadataDraft = {
        kind: seconds && seconds > 0 && seconds <= LIMITS.shortSeconds ? "short" : "video",
        title: video.title, description: "", tags: [], categoryId: "", madeForKids: false, privacyStatus: "public",
        paidPromotion: false, language: "vi", hasCaptions: false, durationSeconds: seconds, thumbnail: null, handle,
      };
      return { key: `pub-${video.videoId}`, id: null, youtubeVideoId: video.videoId, title: video.title, thumbnail: video.thumbnail, meta: `${video.published || "công khai"} · ${video.duration || "?"} · ${video.views ? `${video.views} lượt xem` : "?"}`, source: "public" as const, report: analyzeMetadata(draft), draft };
    });
    return [...fromYoutube, ...fromPublic];
  }, [videos, publicVideos, handle]);

  useEffect(() => {
    if (!requestedVideo) return;
    const match = scored.find((item) => item.id === requestedVideo || item.youtubeVideoId === requestedVideo);
    if (match) { setSelected(match); setTab("videos"); }
  }, [requestedVideo, scored]);

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return text ? scored.filter((item) => item.title.toLowerCase().includes(text)) : scored;
  }, [scored, query]);

  const overview = useMemo(() => {
    const total = scored.length;
    const avg = total ? Math.round(scored.reduce((sum, item) => sum + item.report.score, 0) / total) : 0;
    const blockers = scored.filter((item) => !item.report.readyToPublish);
    return { total, avg, blockers: blockers.length, grade: avg >= 92 ? "A+" : avg >= 82 ? "A" : avg >= 70 ? "B" : avg >= 55 ? "C" : "D" };
  }, [scored]);

  const uploadDraft: MetadataDraft = useMemo(() => ({
    kind, title, description, tags: tagText.split(",").map((tag) => tag.trim()).filter(Boolean), categoryId,
    madeForKids, privacyStatus: privacy, paidPromotion, language: "vi", hasCaptions,
    durationSeconds: null, thumbnail: null, handle,
  }), [kind, title, description, tagText, categoryId, madeForKids, privacy, paidPromotion, hasCaptions, handle]);
  const uploadReport = useMemo(() => analyzeMetadata(uploadDraft), [uploadDraft]);
  const uploadAssistant = useMemo(() => buildAssistant(uploadDraft, uploadReport, channelTitle), [uploadDraft, uploadReport, channelTitle]);

  async function saveNotes(item: Scored) {
    if (!item.id) { downloadText(`ghi-chu-${item.youtubeVideoId}.txt`, buildAssistant(item.draft, item.report, channelTitle).notes); notify("Video chưa đồng bộ qua OAuth nên không lưu được vào DB — TubeFlow đã tải file ghi chú."); return; }
    setSavingNotes(item.key);
    try {
      await requestJson(`/api/youtube/videos/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ localNotes: buildAssistant(item.draft, item.report, channelTitle).notes.slice(0, 5000), localStatus: "published" }) });
      const list = await requestJson<StudioVideo[]>("/api/youtube/videos");
      if (Array.isArray(list)) { setVideos(list); onVideosChange(list); }
      notify("Đã lưu ghi chú tối ưu vào video trong TubeFlow.");
    } catch (error) { notify(error instanceof Error ? error.message : "Không lưu được ghi chú", true); }
    finally { setSavingNotes(null); }
  }

  async function openComments(videoId: string) {
    setCommentTarget(videoId); setLoadingComments(true); setComments([]);
    try {
      let payload: unknown;
      try { payload = await requestJson<unknown>(`/api/youtube/comments?videoId=${encodeURIComponent(videoId)}`); }
      catch { payload = await requestJson<unknown>(`/api/youtube/comments?id=${encodeURIComponent(videoId)}`); }
      const list = Array.isArray(payload) ? payload : (payload as { comments?: VideoComment[] }).comments;
      setComments(Array.isArray(list) ? list : []);
    } catch (error) { notify(error instanceof Error ? error.message : "Không đọc được bình luận", true); }
    finally { setLoadingComments(false); }
  }

  async function loadAnalytics() {
    setLoadingAnalytics(true);
    try {
      const totals = await requestJson<AnalyticsData>("/api/youtube/analytics");
      if (totals && Array.isArray(totals.rows)) setReport30(totals);
      const rows = await requestJson<unknown>("/api/youtube/analytics/videos");
      const list = Array.isArray(rows) ? rows : (rows as { rows?: VideoAnalyticsRow[] }).rows;
      if (Array.isArray(list)) setVideoRows(list);
    } catch (error) { notify(error instanceof Error ? error.message : "Chưa đọc được phân tích (cần kết nối OAuth)", true); }
    finally { setLoadingAnalytics(false); }
  }

  async function submitUpload(event: FormEvent) {
    event.preventDefault();
    if (!uploadReport.readyToPublish) { notify(`Còn ${uploadReport.blockers.length} lỗi vi phạm chính sách phải xử lý trước khi đăng.`, true); return; }
    if (!file) { notify("Hãy chọn file video.", true); return; }
    if (!channel) {
      downloadText(`goi-dang-youtube-${Date.now()}.txt`, uploadAssistant.notes);
      notify("Chưa kết nối OAuth: TubeFlow đã xuất gói tiêu đề/mô tả/tag/ghi chú và mở YouTube Studio để bạn dán vào.");
      window.open("https://studio.youtube.com", "_blank", "noopener");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("title", title.slice(0, LIMITS.title));
      form.set("description", description.slice(0, LIMITS.description));
      form.set("privacyStatus", publishAt ? "private" : privacy);
      form.set("format", kind);
      if (publishAt) form.set("publishAt", new Date(publishAt).toISOString());
      const result = await requestJson<{ video: { id: string } | null }>("/api/youtube/upload", { method: "POST", body: form });
      if (result.video) await requestJson(`/api/youtube/videos/${result.video.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ localNotes: uploadAssistant.notes.slice(0, 5000) }) }).catch(() => undefined);
      const list = await requestJson<StudioVideo[]>("/api/youtube/videos").catch(() => null);
      if (Array.isArray(list)) { setVideos(list); onVideosChange(list); }
      notify("Đã đẩy video sang YouTube kèm ghi chú tối ưu.");
      window.open("https://studio.youtube.com", "_blank", "noopener");
      setFile(null); setTitle(""); setDescription(""); setTagText("");
    } catch (error) { notify(error instanceof Error ? error.message : "Không đăng được video", true); }
    finally { setUploading(false); }
  }

  async function pushToPlanner() {
    if (!title.trim()) { notify("Cần tiêu đề để đưa vào lịch nội dung.", true); return; }
    try {
      const plan = await requestJson<Plan>("/api/plans", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.slice(0, 200), description: `${description.slice(0, 4000)}\n\n--- GHI CHÚ TỐI ƯU ---\n${uploadAssistant.notes}`.slice(0, 5000), format: kind, status: publishAt ? "planned" : "idea", scheduledDate: publishAt ? publishAt.slice(0, 10) : null }),
      });
      const plans = await requestJson<Plan[]>("/api/plans");
      onPlansChange(Array.isArray(plans) ? plans : [plan]);
      notify("Đã lưu bản nháp kèm ghi chú AI vào lịch nội dung.");
      onNavigate("planner");
    } catch (error) { notify(error instanceof Error ? error.message : "Không lưu được vào lịch", true); }
  }

  const shown = channel || null;
  const avatar = shown?.thumbnail || publicChannel?.thumbnail || null;
  const subscribers = shown?.subscribers ?? publicChannel?.subscribers ?? "0";
  const videoCount = shown?.videoCount ?? publicChannel?.videoCount ?? String(scored.length);
  const views = shown?.views ?? publicChannel?.views ?? "0";
  const studioUrl = shown?.channelId ? `https://studio.youtube.com/channel/${shown.channelId}` : "https://studio.youtube.com";
  const channelUrl = publicChannel?.url || (shown ? `https://www.youtube.com/channel/${shown.channelId}` : `https://www.youtube.com/${handle}`);

  return (
    <div className="youtube-workspace space-y-4">
      <PlatformSwitch current="youtube" onNavigate={onNavigate} youtubeConnected={!!data.channel} />
      <div className="page-heading">
        <div><p className="eyebrow">YOUTUBE STUDIO</p><h1>{channelTitle}<span className="heading-dot">.</span></h1><p className="text-[12.5px] text-slate-500">{shown ? `Đã kết nối OAuth · cập nhật ${formatDate(shown.updatedAt)}` : `Đồng bộ công khai ${handle}${lastSync ? ` · ${new Date(lastSync).toLocaleString("vi-VN")}` : ""}`}</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="button" onClick={() => void syncEverything()} disabled={syncing}>{syncing ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}Đồng bộ ngay</button>
          <a className="button" href={channelUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} />Xem kênh</a>
          <a className="button button-primary" href={studioUrl} target="_blank" rel="noopener noreferrer"><Play size={14} />Mở YouTube Studio</a>
        </div>
      </div>

      <div className="card flex flex-wrap items-center gap-4 p-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {avatar ? <img src={avatar} alt="" className="h-14 w-14 rounded-full object-cover" /> : <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#f1ecfc] text-[#7858d6]"><Clapperboard size={22} /></span>}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-[15px] font-semibold">{channelTitle}</h2>
              <span className={`rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${shown ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-sky-200 bg-sky-50 text-sky-700"}`}>{shown ? "OAuth đã kết nối" : publicChannel ? "Nguồn công khai" : syncing ? "Đang đồng bộ…" : "Chưa kết nối"}</span>
            </div>
            <p className="font-mono text-[11.5px] text-slate-500">{publicChannel?.handle || handle}{publicChannel?.channelId ? ` · ${publicChannel.channelId}` : ""}</p>
            <div className="mt-1 flex flex-wrap gap-3 text-[11.5px] text-slate-600">
              <span className="inline-flex items-center gap-1"><Users size={13} />{shown || publicChannel ? formatNumber(subscribers) : "—"} người đăng ký</span>
              <span className="inline-flex items-center gap-1"><Film size={13} />{shown || publicChannel ? formatNumber(videoCount) : "—"} video</span>
              <span className="inline-flex items-center gap-1"><Eye size={13} />{shown?.views || publicChannel?.views ? formatNumber(views) : "—"} lượt xem</span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg border border-[#eeeaf5] px-4 py-2"><p className="font-mono text-xl font-semibold text-[#5c3fb0]">{overview.total}</p><p className="text-[10.5px] text-slate-500">video đang quản lý</p></div>
          <div className="rounded-lg border border-[#eeeaf5] px-4 py-2"><p className="font-mono text-xl font-semibold text-[#5c3fb0]">{overview.avg}</p><p className="text-[10.5px] text-slate-500">điểm tuân thủ TB</p></div>
          <div className="rounded-lg border border-[#eeeaf5] px-4 py-2"><p className={`font-mono text-xl font-semibold ${overview.blockers ? "text-[#9d485a]" : "text-emerald-600"}`}>{overview.blockers}</p><p className="text-[10.5px] text-slate-500">cần xử lý</p></div>
        </div>
      </div>

      {publicError && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11.5px] text-amber-800">{publicError}</p>}

      <div className="studio-tabs" role="group" aria-label="Các khu vực YouTube Studio">
        {TABS.map((entry) => { const Icon = entry.icon; return (
          <button key={entry.id} aria-pressed={tab === entry.id} onClick={() => { setTab(entry.id); const route = new URL(window.location.href); route.searchParams.set("tab", entry.id); route.searchParams.delete("video"); window.history.replaceState({}, "", `${route.pathname}${route.search}`); if (entry.id === "analytics") void loadAnalytics(); }} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-medium transition ${tab === entry.id ? "bg-[#7858d6] text-white" : "bg-white text-[#5f5a6e] border border-[#e9e9f0] hover:border-[#c9b8ee]"}`}><Icon size={14} />{entry.label}</button>); })}
      </div>

      {tab === "dashboard" && (
        <div className="studio-content-layout">
          <div className="space-y-4">
            <section className="card p-4">
              <div className="mb-3 flex items-center justify-between"><div><h2 className="text-[13.5px] font-semibold">Nội dung cần tối ưu</h2><p className="text-[11.5px] text-slate-500">Xếp theo điểm tuân thủ thấp nhất — sửa trước để tránh bị hạn chế phân phối.</p></div><button className="button" onClick={() => setTab("policy")}><ShieldCheck size={14} />Trung tâm chính sách<ArrowRight size={13} /></button></div>
              {scored.length === 0 ? <p className="py-8 text-center text-[12px] text-slate-500">Chưa có video nào. Bấm Đồng bộ ngay hoặc đăng video mới.</p> : (
                <ul className="space-y-1.5">
                  {[...scored].sort((a, b) => a.report.score - b.report.score).slice(0, 6).map((item) => (
                    <li key={item.key}><button className="flex w-full items-center gap-3 rounded-lg border border-[#eeeaf5] px-3 py-2 text-left hover:border-[#c9b8ee]" onClick={() => { setSelected(item); setTab("policy"); }}>
                      {item.thumbnail ? <img src={item.thumbnail} alt="" className="h-10 w-16 shrink-0 rounded object-cover" /> : <span className="flex h-10 w-16 shrink-0 items-center justify-center rounded bg-[#f4f1fb]"><Film size={14} /></span>}
                      <span className="min-w-0 flex-1"><strong className="block truncate text-[12px]">{item.title}</strong><small className="text-[10.5px] text-slate-500">{item.meta}</small></span>
                      <span className={`rounded-md border px-2 py-0.5 font-mono text-[11px] font-semibold ${gradeColor(item.report.grade)}`}>{item.report.score} · {item.report.grade}</span>
                    </button></li>
                  ))}
                </ul>
              )}
            </section>
            <section className="card p-4">
              <div className="mb-3 flex items-center justify-between"><div><h2 className="text-[13.5px] font-semibold">Lên lịch tiếp theo</h2><p className="text-[11.5px] text-slate-500">Kế hoạch nội dung trong không gian của bạn.</p></div><button className="button" onClick={() => onNavigate("planner")}><ArrowRight size={14} />Lịch nội dung</button></div>
              {data.plans.filter((plan) => plan.status !== "published").length === 0 ? <p className="py-6 text-center text-[12px] text-slate-500">Chưa có kế hoạch nào.</p> : (
                <ul className="space-y-1.5">{data.plans.filter((plan) => plan.status !== "published").slice(0, 5).map((plan) => (
                  <li key={plan.id} className="flex items-center gap-3 rounded-lg border border-[#eeeaf5] px-3 py-2"><span className="flex h-8 w-8 items-center justify-center rounded bg-[#f4f1fb] text-[#7858d6]"><Clapperboard size={14} /></span><span className="min-w-0 flex-1"><strong className="block truncate text-[12px]">{plan.title}</strong><small className="text-[10.5px] text-slate-500">{plan.format === "short" ? "Shorts" : plan.format === "live" ? "Trực tiếp" : "Video"} · {plan.scheduledDate ? formatDate(plan.scheduledDate) : "chưa xếp lịch"}</small></span><span className="text-[10.5px] text-slate-500">{plan.status}</span></li>
                ))}</ul>
              )}
            </section>
          </div>
          <div className="space-y-4">
            <section className="card p-4">
              <h2 className="mb-2 text-[13.5px] font-semibold">Việc nên làm hôm nay</h2>
              <ul className="space-y-2 text-[11.5px] text-slate-600">
                <li className="flex gap-2"><span className="text-[#7858d6]"><CheckCircle2 size={14} /></span><span>Đăng 1 video dài + 3 Shorts mỗi tuần để giữ tín hiệu kênh.</span></li>
                <li className="flex gap-2"><span className="text-[#7858d6]"><ShieldCheck size={14} /></span><span>Rà {overview.blockers} video có lỗi chặn trong Trung tâm chính sách.</span></li>
                <li className="flex gap-2"><span className="text-[#7858d6]"><Sparkles size={14} /></span><span>Làm lại thumbnail cho video dưới 4% CTR trong phòng dựng.</span></li>
                <li className="flex gap-2"><span className="text-[#7858d6]"><MessageSquare size={14} /></span><span>Trả lời bình luận trong 24 giờ đầu và ghim câu hỏi hay.</span></li>
                <li className="flex gap-2"><span className="text-[#7858d6]"><BarChart3 size={14} /></span><span>Xem 3 video giữ chân tốt nhất để nhân bản công thức.</span></li>
              </ul>
              <button className="button button-primary mt-3 w-full" onClick={() => setTab("upload")}><Upload size={14} />Đăng video mới</button>
              <button className="button mt-2 w-full" onClick={() => onNavigate("editor")}><Sparkles size={14} />Mở phòng dựng ảnh/video</button>
            </section>
            <section className="card p-4">
              <h2 className="mb-2 text-[13.5px] font-semibold">Kênh đang liên kết</h2>
              <label className="block text-[11px] text-slate-600"><span className="mb-1 block font-medium">Handle kênh chính</span><input value={handleInput} onChange={(event) => setHandleInput(event.target.value)} className="w-full" /></label>
              <button className="button mt-2 w-full" onClick={bindHandle} disabled={syncing}><Link2 size={14} />Lưu & đồng bộ lại</button>
              <p className="mt-2 text-[10.5px] leading-relaxed text-slate-500">Dữ liệu công khai lấy trực tiếp từ youtube.com/{handle}: tiêu đề kênh, ảnh đại diện, số người đăng ký, số video và danh sách video mới nhất. Khi có OAuth, dữ liệu API sẽ được ưu tiên.</p>
            </section>
          </div>
        </div>
      )}

      {(tab === "videos" || tab === "policy") && (
        <div className="studio-content-layout">
          <section className="card p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm theo tiêu đề video…" className="min-w-[200px] flex-1" />
              <span className="text-[11px] text-slate-500">{filtered.length}/{scored.length} video · nguồn {shown ? "OAuth + công khai" : "công khai"}</span>
            </div>
            {filtered.length === 0 ? <p className="py-10 text-center text-[12px] text-slate-500">Không có video phù hợp.</p> : (
              <ul className="space-y-1.5">
                {filtered.map((item) => (
                  <li key={item.key}>
                    <button className="flex w-full items-center gap-3 rounded-lg border border-[#eeeaf5] px-3 py-2 text-left hover:border-[#c9b8ee]" onClick={() => setSelected(item)}>
                      {item.thumbnail ? <img src={item.thumbnail} alt="" className="h-11 w-20 shrink-0 rounded object-cover" /> : <span className="flex h-11 w-20 shrink-0 items-center justify-center rounded bg-[#f4f1fb]"><Film size={15} /></span>}
                      <span className="min-w-0 flex-1"><strong className="block truncate text-[12px]">{item.title}</strong><small className="text-[10.5px] text-slate-500">{item.meta}</small></span>
                      <span className={`shrink-0 rounded-md border px-2 py-0.5 font-mono text-[11px] font-semibold ${gradeColor(item.report.grade)}`}>{item.report.score}</span>
                      {!item.report.readyToPublish && <span className="shrink-0 text-[#9d485a]" title={`${item.report.blockers.length} lỗi chặn`}><AlertTriangle size={15} /></span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="card p-4">
            {selected ? (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2"><h2 className="text-[13px] font-semibold">{selected.title}</h2><button className="text-slate-400 hover:text-slate-600" onClick={() => setSelected(null)} aria-label="Đóng"><X size={15} /></button></div>
                {selected.thumbnail && <img src={selected.thumbnail} alt="" className="w-full rounded-lg" />}
                <div className={`flex items-center justify-between rounded-lg border px-3 py-2 ${gradeColor(selected.report.grade)}`}>
                  <span className="text-[11.5px] font-semibold">Điểm tuân thủ {selected.report.score}/100 · hạng {selected.report.grade}</span>
                  <span className="text-[11px]">{selected.report.readyToPublish ? "Đạt" : `${selected.report.blockers.length} lỗi chặn`}</span>
                </div>
                <ul className="space-y-1.5">
                  {selected.report.findings.slice(0, 10).map((finding) => (
                    <li key={finding.id} className={`rounded-lg border p-2.5 text-[11.5px] ${finding.level === "blocker" ? "border-rose-200 bg-rose-50" : finding.level === "warning" ? "border-amber-200 bg-amber-50" : "border-[#eeeaf5] bg-[#faf8fe]"}`}>
                      <p className="font-semibold">{finding.area}</p><p className="mt-0.5 text-slate-600">{finding.message}</p>
                      {finding.fix && <p className="mt-1 text-[#6f579c]">Cách sửa: {finding.fix}</p>}
                    </li>
                  ))}
                  {selected.report.findings.length === 0 && <li className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-[11.5px] text-emerald-700">Không phát hiện rủi ro chính sách nào.</li>}
                </ul>
                <div className="rounded-lg border border-[#eeeaf5] p-3">
                  <div className="mb-1.5 flex items-center justify-between"><h3 className="text-[12px] font-semibold">Ghi chú tối ưu (AI)</h3><CopyButton text={buildAssistant(selected.draft, selected.report, channelTitle).notes} label="Copy" compact /></div>
                  <pre className="max-h-44 overflow-auto whitespace-pre-wrap rounded bg-[#faf8fe] p-2 font-mono text-[10.5px] text-slate-600">{buildAssistant(selected.draft, selected.report, channelTitle).notes}</pre>
                  <button className="button button-primary mt-2 w-full" onClick={() => void saveNotes(selected)} disabled={savingNotes === selected.key}>{savingNotes === selected.key ? <Loader2 size={14} className="spin" /> : <Download size={14} />}{selected.id ? "Lưu ghi chú vào TubeFlow" : "Tải ghi chú .txt"}</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selected.youtubeVideoId && <a className="button" href={`https://studio.youtube.com/video/${selected.youtubeVideoId}/edit`} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} />Sửa trong YouTube Studio</a>}
                  {selected.youtubeVideoId && <button className="button" onClick={() => { setTab("comments"); void openComments(selected.youtubeVideoId as string); }}><MessageSquare size={14} />Xem bình luận</button>}
                  {selected.id && <button className="button" onClick={() => onNavigate("facebook", { tab: "compose", videoId: selected.id ?? undefined })}><Share2 size={14} />Đăng sang Facebook</button>}
                  <button className="button" onClick={() => onNavigate("editor")}><Sparkles size={14} />Làm lại thumbnail</button>
                </div>
              </div>
            ) : (
              <div className="py-14 text-center text-slate-500"><ShieldCheck size={30} className="mx-auto mb-2 opacity-60" /><p className="text-[12px]">Chọn một video để xem báo cáo tuân thủ và ghi chú tối ưu.</p></div>
            )}
          </section>
        </div>
      )}

      {tab === "upload" && (
        <form onSubmit={submitUpload} className="studio-content-layout">
          <section className="card space-y-3 p-4">
            <h2 className="text-[13.5px] font-semibold">Đăng video đã được kiểm duyệt chính sách</h2>
            <label className="block rounded-lg border border-dashed border-[#d9d3ec] bg-[#faf8fe] p-4 text-center">
              <input type="file" accept="video/*" className="hidden" onChange={(event) => { const picked = event.target.files?.[0] || null; setFile(picked); if (picked && !title) setTitle(picked.name.replace(/\.[^.]+$/, "")); if (picked) notify(`Đã chọn ${picked.name} · ${(picked.size / 1024 / 1024).toFixed(1)}MB (giới hạn 2GB).`); }} />
              <Upload size={20} className="mx-auto mb-2 text-[#7858d6]" />
              <span className="block text-[12px] font-medium">{file ? file.name : "Bấm để chọn file video (MP4/WebM/MOV, tối đa 2GB)"}</span>
              {file && <span className="mt-1 block text-[11px] text-slate-500">{(file.size / 1024 / 1024).toFixed(1)}MB · {file.type}</span>}
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-[11px] text-slate-600 sm:col-span-2"><span className="mb-1 flex justify-between font-medium"><span>Tiêu đề</span><span className="font-mono text-slate-400">{title.length}/{LIMITS.title}</span></span><input value={title} onChange={(event) => setTitle(event.target.value)} className="w-full" placeholder="Từ khóa chính trong 60 ký tự đầu" /></label>
              <label className="block text-[11px] text-slate-600 sm:col-span-2"><span className="mb-1 flex justify-between font-medium"><span>Mô tả</span><span className="font-mono text-slate-400">{description.length}/{LIMITS.description}</span></span><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={6} className="w-full" placeholder="150 ký tự đầu hiển thị trước nút Thêm…" /></label>
              <label className="block text-[11px] text-slate-600 sm:col-span-2"><span className="mb-1 flex justify-between font-medium"><span>Tag (phân cách bằng dấu phẩy)</span><span className="font-mono text-slate-400">{uploadReport.tagBudget.used}/{uploadReport.tagBudget.limit}</span></span><input value={tagText} onChange={(event) => setTagText(event.target.value)} className="w-full" /></label>
              <label className="block text-[11px] text-slate-600"><span className="mb-1 block font-medium">Định dạng</span><select value={kind} onChange={(event) => setKind(event.target.value as "video" | "short")} className="w-full"><option value="video">Video thường</option><option value="short">Shorts (dưới 180s)</option></select></label>
              <label className="block text-[11px] text-slate-600"><span className="mb-1 block font-medium">Danh mục</span><select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="w-full">{CATEGORIES.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}</select></label>
              <label className="block text-[11px] text-slate-600"><span className="mb-1 block font-medium">Chế độ hiển thị</span><select value={privacy} onChange={(event) => setPrivacy(event.target.value)} className="w-full"><option value="private">Riêng tư</option><option value="unlisted">Không công khai</option><option value="public">Công khai</option></select></label>
              <label className="block text-[11px] text-slate-600"><span className="mb-1 block font-medium">Lên lịch</span><input type="datetime-local" value={publishAt} onChange={(event) => setPublishAt(event.target.value)} className="w-full" /></label>
            </div>
            <div className="flex flex-wrap gap-4 text-[11.5px] text-slate-600">
              <label className="flex items-center gap-2"><input type="checkbox" checked={madeForKids} onChange={(event) => setMadeForKids(event.target.checked)} className="accent-[#7858d6]" />Dành cho trẻ em (COPPA)</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={paidPromotion} onChange={(event) => setPaidPromotion(event.target.checked)} className="accent-[#7858d6]" />Có nội dung trả phí/tài trợ</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={hasCaptions} onChange={(event) => setHasCaptions(event.target.checked)} className="accent-[#7858d6]" />Có phụ đề</label>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-[#eeeaf5] pt-3">
              <button type="submit" className="button button-primary" disabled={uploading}>{uploading ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}{channel ? "Kiểm tra & đẩy sang YouTube" : "Xuất gói đăng + mở Studio"}</button>
              <button type="button" className="button" onClick={() => void pushToPlanner()}><Clapperboard size={14} />Lưu bản nháp vào lịch</button>
              <button type="button" className="button" onClick={() => onNavigate("editor")}><Sparkles size={14} />Dựng ảnh/video trước</button>
            </div>
          </section>
          <aside className="space-y-3">
            <section className="card p-4">
              <div className="mb-2 flex items-end justify-between"><h2 className="text-[13px] font-semibold">Kiểm tra trước khi đăng</h2><span className={`rounded-md border px-2 py-0.5 font-mono text-[12px] font-semibold ${gradeColor(uploadReport.grade)}`}>{uploadReport.score} · {uploadReport.grade}</span></div>
              <div className="mb-3 h-2 overflow-hidden rounded-full bg-[#eeeaf5]"><span className={`block h-full ${uploadReport.readyToPublish ? "bg-emerald-500" : "bg-rose-500"}`} style={{ width: `${uploadReport.score}%` }} /></div>
              <ul className="space-y-1">{uploadReport.checklist.map((entry) => (
                <li key={entry.id} className="flex items-start gap-2 text-[11.5px]"><span className={entry.state === "pass" ? "text-emerald-600" : entry.state === "fail" ? "text-[#9d485a]" : "text-slate-400"}>{entry.state === "pass" ? <CheckCircle2 size={13} /> : entry.state === "fail" ? <AlertTriangle size={13} /> : <X size={13} />}</span><span className="flex-1">{entry.label}{entry.detail ? <em className="ml-1 not-italic text-slate-400">({entry.detail})</em> : null}</span></li>
              ))}</ul>
            </section>
            <section className="card p-4">
              <div className="mb-2 flex items-center justify-between"><h2 className="text-[13px] font-semibold">Trợ lý AI</h2><span className="text-[10.5px] text-slate-500">bám kênh {handle}</span></div>
              <p className="mb-1.5 text-[11px] font-medium text-slate-600">Tiêu đề đề xuất</p>
              <div className="mb-3 space-y-1">{uploadAssistant.titles.map((line) => <button type="button" key={line} onClick={() => setTitle(line)} className="block w-full rounded-md border border-[#eeeaf5] bg-[#faf8fe] px-2 py-1.5 text-left text-[11px] hover:border-[#c9b8ee]">{line}</button>)}</div>
              <div className="mb-2 flex items-center justify-between"><p className="text-[11px] font-medium text-slate-600">Mô tả + chương</p><button type="button" className="button" onClick={() => setDescription(uploadAssistant.description)}>Áp dụng</button></div>
              <pre className="mb-3 max-h-36 overflow-auto whitespace-pre-wrap rounded bg-[#faf8fe] p-2 font-mono text-[10.5px] text-slate-600">{uploadAssistant.description}</pre>
              <div className="mb-2 flex items-center justify-between"><p className="text-[11px] font-medium text-slate-600">Tag tối ưu</p><button type="button" className="button" onClick={() => setTagText(uploadAssistant.tags.join(", "))}>Áp dụng</button></div>
              <div className="mb-3 flex flex-wrap gap-1">{uploadAssistant.tags.map((tag) => <span key={tag} className="rounded bg-[#f1ecfc] px-1.5 py-0.5 text-[10.5px] text-[#5f4a94]">{tag}</span>)}</div>
              <p className="mb-1 text-[11px] font-medium text-slate-600">Khung giờ đăng (Việt Nam)</p>
              <ul className="mb-3 space-y-1 text-[11px] text-slate-600">{uploadAssistant.publishWindows.map((line) => <li key={line}>• {line}</li>)}</ul>
              <div className="flex gap-2"><CopyButton text={uploadAssistant.notes} label="Copy ghi chú" compact /><button type="button" className="button" onClick={() => downloadText(`ghi-chu-${Date.now()}.txt`, uploadAssistant.notes)}><Download size={13} />Tải .txt</button></div>
            </section>
          </aside>
        </form>
      )}

      {tab === "comments" && (
        <section className="card p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="text-[13.5px] font-semibold">Bình luận</h2>
            <select value={commentTarget} onChange={(event) => void openComments(event.target.value)} className="max-w-xs">
              <option value="">Chọn video…</option>
              {scored.filter((item) => item.youtubeVideoId).map((item) => <option key={item.key} value={item.youtubeVideoId as string}>{item.title.slice(0, 60)}</option>)}
            </select>
            {loadingComments && <Loader2 size={14} className="spin text-[#7858d6]" />}
            <span className="ml-auto text-[11px] text-slate-500">{comments.length} bình luận</span>
          </div>
          {!channel ? <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11.5px] text-amber-800">Đọc bình luận cần kết nối OAuth với quyền youtube.readonly. Hoàn tất trong mục Kết nối kênh.</p> : null}
          {comments.length === 0 ? <p className="py-10 text-center text-[12px] text-slate-500">{loadingComments ? "Đang tải…" : "Chưa có bình luận nào để hiển thị."}</p> : (
            <ul className="space-y-2">{comments.map((comment) => (
              <li key={comment.id} className="rounded-lg border border-[#eeeaf5] p-3">
                <div className="mb-1 flex flex-wrap items-center gap-2"><strong className="text-[12px]">{comment.author}</strong><span className="inline-flex items-center gap-1 text-[10.5px] text-slate-500"><ThumbsUp size={12} />{comment.likeCount}</span><span className="text-[10.5px] text-slate-400">{new Date(comment.publishedAt).toLocaleString("vi-VN")}</span>{comment.authorChannelUrl && <a className="text-[10.5px] text-[#7858d6]" href={comment.authorChannelUrl} target="_blank" rel="noopener noreferrer">kênh</a>}</div>
                <p className="whitespace-pre-wrap text-[12px] text-slate-700">{comment.text}</p>
                {comment.replyCount > 0 && <p className="mt-1 text-[10.5px] text-slate-500">{comment.replyCount} phản hồi</p>}
              </li>
            ))}</ul>
          )}
        </section>
      )}

      {tab === "analytics" && (
        <section className="card p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2"><h2 className="text-[13.5px] font-semibold">Phân tích 28 ngày</h2><button className="button" onClick={() => void loadAnalytics()} disabled={loadingAnalytics}>{loadingAnalytics ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}Tải lại</button>{report30 && <span className="text-[11px] text-slate-500">{formatDate(report30.startDate)} → {formatDate(report30.endDate)}</span>}</div>
          {!channel ? <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11.5px] text-amber-800">Cần kết nối OAuth (quyền yt-analytics.readonly) để đọc số liệu chi tiết. Dữ liệu công khai chỉ gồm số người đăng ký và số video.</p> : null}
          {report30 ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-[#eeeaf5] p-3"><p className="text-[10.5px] uppercase tracking-wider text-slate-500">Lượt xem</p><p className="font-mono text-2xl font-semibold text-[#5c3fb0]">{formatNumber(report30.rows.reduce((sum, row) => sum + row.views, 0))}</p></div>
              <div className="rounded-lg border border-[#eeeaf5] p-3"><p className="text-[10.5px] uppercase tracking-wider text-slate-500">Giờ xem</p><p className="font-mono text-2xl font-semibold text-[#5c3fb0]">{formatNumber(Math.round(report30.rows.reduce((sum, row) => sum + row.minutes, 0) / 60))}</p></div>
              <div className="rounded-lg border border-[#eeeaf5] p-3"><p className="text-[10.5px] uppercase tracking-wider text-slate-500">Người đăng ký mới</p><p className="font-mono text-2xl font-semibold text-[#5c3fb0]">{formatNumber(report30.rows.reduce((sum, row) => sum + row.subscribers, 0))}</p></div>
            </div>
          ) : <p className="py-8 text-center text-[12px] text-slate-500">Chưa có dữ liệu phân tích.</p>}
          {videoRows.length > 0 && (
            <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-[11.5px]">
              <thead className="border-b border-[#eeeaf5] text-[10.5px] uppercase tracking-wider text-slate-500"><tr><th className="py-2 pr-3">Video</th><th className="py-2 pr-3">Lượt xem</th><th className="py-2 pr-3">Phút xem</th><th className="py-2 pr-3">Thời lượng TB</th><th className="py-2">Sub mới</th></tr></thead>
              <tbody>{videoRows.map((row) => <tr key={row.videoId} className="border-b border-[#f4f1fb]"><td className="py-2 pr-3 font-mono">{row.videoId}</td><td className="py-2 pr-3">{formatNumber(row.views)}</td><td className="py-2 pr-3">{formatNumber(row.minutes)}</td><td className="py-2 pr-3">{clock(row.averageDuration)}</td><td className="py-2">{formatNumber(row.subscribers)}</td></tr>)}</tbody>
            </table></div>
          )}
        </section>
      )}

      {tab === "sync" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="card p-4">
            <h2 className="text-[13.5px] font-semibold">Nguồn đồng bộ</h2>
            <p className="mt-1 text-[11.5px] text-slate-500">TubeFlow ưu tiên dữ liệu API khi kênh đã kết nối OAuth; nếu chưa, hệ thống đọc trang công khai của kênh theo handle.</p>
            <dl className="mt-3 space-y-2 text-[11.5px]">
              <div className="flex justify-between gap-3 border-b border-[#f4f1fb] pb-2"><dt className="text-slate-500">Handle</dt><dd className="font-mono">{publicChannel?.handle || handle}</dd></div>
              <div className="flex justify-between gap-3 border-b border-[#f4f1fb] pb-2"><dt className="text-slate-500">Channel ID</dt><dd className="font-mono">{shown?.channelId || publicChannel?.channelId || "—"}</dd></div>
              <div className="flex justify-between gap-3 border-b border-[#f4f1fb] pb-2"><dt className="text-slate-500">Nguồn</dt><dd>{shown ? "YouTube Data API (OAuth)" : "Trang công khai youtube.com"}</dd></div>
              <div className="flex justify-between gap-3 border-b border-[#f4f1fb] pb-2"><dt className="text-slate-500">Lần đồng bộ cuối</dt><dd>{lastSync ? new Date(lastSync).toLocaleString("vi-VN") : "—"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Video công khai đọc được</dt><dd className="font-mono">{publicVideos.length}</dd></div>
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="button button-primary" onClick={() => void syncEverything()} disabled={syncing}>{syncing ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}Đồng bộ ngay</button>
              {!config.ready && <button className="button" onClick={() => onNavigate("connections")}><Link2 size={14} />Kết nối OAuth</button>}
            </div>
            {publicChannel?.description && <p className="mt-3 rounded-lg bg-[#faf8fe] p-3 text-[11.5px] text-slate-600">{publicChannel.description}</p>}
          </section>
          <section className="card p-4">
            <h2 className="text-[13.5px] font-semibold">Video đọc từ kênh công khai</h2>
            {publicVideos.length === 0 ? <p className="py-8 text-center text-[12px] text-slate-500">{syncing ? "Đang đọc kênh…" : "Chưa đọc được video công khai nào."}</p> : (
              <ul className="mt-2 space-y-1.5">{publicVideos.map((video) => (
                <li key={video.videoId} className="flex items-center gap-3 rounded-lg border border-[#eeeaf5] px-3 py-2">
                  {video.thumbnail ? <img src={video.thumbnail} alt="" className="h-10 w-16 shrink-0 rounded object-cover" /> : <span className="flex h-10 w-16 items-center justify-center rounded bg-[#f4f1fb]"><Film size={14} /></span>}
                  <span className="min-w-0 flex-1"><strong className="block truncate text-[12px]">{video.title}</strong><small className="text-[10.5px] text-slate-500">{video.published || ""} · {video.duration || "?"} · {video.views || "?"} lượt xem</small></span>
                  <a className="button" href={video.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} /></a>
                </li>
              ))}</ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
