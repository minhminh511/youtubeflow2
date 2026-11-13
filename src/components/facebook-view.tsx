"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, BarChart3, CalendarClock, CheckCircle2, ChevronRight, Clapperboard, Copy, ExternalLink, FileText, Link2, Loader2, Plus, RefreshCw, Share2, ShieldCheck, Trash2, Unlink, Upload, Users, Wallet, X } from "lucide-react";
import { FacebookComposer, type ComposerPrefill } from "@/components/facebook-composer";
import { PlatformSwitch } from "@/components/platform-switch";
import { FB_KIND_LABELS, EARNING_SOURCES, parseEarningsCsv, type FbKind, isValidAmount, isValidDate, normalizeIsoDate } from "@/lib/facebook-policy";
import { formatNumber } from "@/lib/client";
import type { FbEarningsResponse, FbOverview, FbPost, FbStatus } from "@/lib/facebook-types";
import type { View, WorkspaceData } from "@/lib/types";

type Tab = "overview" | "compose" | "posts" | "earnings" | "policy";
const TABS: { id: Tab; label: string; icon: typeof BarChart3 }[] = [
  { id: "overview", label: "Tổng quan", icon: BarChart3 },
  { id: "compose", label: "Soạn & đăng", icon: FileText },
  { id: "posts", label: "Lịch & bài đăng", icon: CalendarClock },
  { id: "earnings", label: "Kiếm tiền", icon: Wallet },
  { id: "policy", label: "Trung tâm chính sách", icon: ShieldCheck },
];
const STATUS_LABEL: Record<FbPost["status"], string> = { draft: "Bản nháp", scheduled: "Đã lên lịch", published: "Đã đăng", failed: "Thất bại" };
const money = (value: string | number, currency = "USD") => `${Number(value || 0).toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

export function FacebookView({ data, onNavigate, notify }: { data: WorkspaceData; onNavigate: (view: View, route?: { tab?: string; videoId?: string; planId?: string }) => void; notify: (message: string, error?: boolean) => void }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [status, setStatus] = useState<FbStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [overview, setOverview] = useState<FbOverview | null>(null);
  const [overviewError, setOverviewError] = useState("");
  const [posts, setPosts] = useState<FbPost[]>([]);
  const [earnings, setEarnings] = useState<FbEarningsResponse | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [prefill, setPrefill] = useState<ComposerPrefill | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/facebook/status", { cache: "no-store" });
      if (response.ok) setStatus((await response.json()) as FbStatus);
    } finally { setLoadingStatus(false); }
  }, []);
  const loadOverview = useCallback(async () => {
    setOverviewError("");
    const response = await fetch("/api/facebook/overview", { cache: "no-store" });
    const body = await response.json().catch(() => ({})) as FbOverview & { error?: string };
    if (!response.ok) { setOverview(null); setOverviewError(body.error || "Không đọc được số liệu Trang."); return; }
    setOverview(body);
  }, []);
  const loadPosts = useCallback(async () => {
    const response = await fetch("/api/facebook/posts", { cache: "no-store" });
    if (response.ok) setPosts((await response.json()) as FbPost[]);
  }, []);
  const loadEarnings = useCallback(async () => {
    const response = await fetch("/api/facebook/earnings", { cache: "no-store" });
    if (response.ok) setEarnings((await response.json()) as FbEarningsResponse);
  }, []);

  useEffect(() => {
    void loadStatus();
    const url = new URL(window.location.href);
    const requestedTab = url.searchParams.get("tab");
    if (requestedTab === "compose") setTab("compose");
    const videoId = url.searchParams.get("video");
    const video = videoId ? data.videos.find((item) => item.id === videoId) : null;
    if (video) {
      setPrefill({
        message: `${video.title}\n\n${video.description}`.trim().slice(0, 2000),
        kind: "video",
        sourceLabel: `Từ video YouTube: ${video.title.slice(0, 40)}`,
      });
      setTab("compose");
    }
    // Initial route handling is intentionally one-shot; later changes come through navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!status?.connected) return;
    if (tab === "overview") void loadOverview().catch(() => setOverviewError("Không kết nối được tới Meta. Thử lại sau."));
    if (tab === "posts" || tab === "compose") void loadPosts();
    if (tab === "earnings" || tab === "policy") { void loadEarnings(); void loadPosts(); }
  }, [tab, status?.connected, status?.activePageId, loadOverview, loadPosts, loadEarnings]);

  const activePage = status?.pages.find((page) => page.id === status.activePageId) ?? null;
  const canPublish = !!activePage && (activePage.tasks.includes("CREATE_CONTENT") || activePage.tasks.includes("MANAGE"));
  const scheduledCount = posts.filter((post) => post.status === "scheduled").length;
  const failedCount = posts.filter((post) => post.status === "failed").length;

  async function syncEarnings() {
    setSyncing(true);
    try {
      const response = await fetch("/api/facebook/earnings/sync", { method: "POST" });
      const body = await response.json().catch(() => ({})) as { message?: string; error?: string };
      if (!response.ok) throw new Error(body.error || "Đồng bộ thất bại.");
      notify(body.message || "Đã đồng bộ.");
      await Promise.all([loadEarnings(), loadStatus()]);
    } catch (error) { notify(error instanceof Error ? error.message : "Đồng bộ thất bại.", true); }
    finally { setSyncing(false); }
  }

  async function removePost(post: FbPost) {
    const message = post.status === "scheduled" ? "Huỷ lịch đăng này trên Facebook và xoá khỏi TubeFlow?" : "Xoá mục này khỏi TubeFlow?";
    if (!window.confirm(message)) return;
    const response = await fetch(`/api/facebook/posts/${post.id}`, { method: "DELETE" });
    const body = await response.json().catch(() => ({})) as { message?: string; error?: string };
    if (!response.ok) { notify(body.error || "Không xoá được.", true); return; }
    notify(body.message || "Đã xoá.");
    await loadPosts();
  }

  async function saveDraft(post: FbPost, text: string) {
    const response = await fetch(`/api/facebook/posts/${post.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text }) });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) { notify(body.error || "Không lưu được bản nháp.", true); return; }
    notify("Đã lưu bản nháp.");
    await loadPosts();
  }

  const sortedPosts = useMemo(() => [...posts].sort((a, b) => (b.scheduledAt || b.publishedAt || b.createdAt).localeCompare(a.scheduledAt || a.publishedAt || a.createdAt)), [posts]);

  if (loadingStatus) {
    return <div className="fb-loading"><Loader2 size={26} className="spin" /><p>Đang tải không gian Facebook…</p></div>;
  }

  return (
    <div className="fb-workspace">
      <PlatformSwitch current="facebook" onNavigate={onNavigate} youtubeConnected={!!data.channel} />

      <header className="fb-hero">
        <div className="fb-hero-copy">
          <span className="fb-eyebrow"><Share2 size={13} />FACEBOOK PAGES</span>
          <h1>{activePage ? activePage.name : "Kết nối Trang Facebook"}</h1>
          <p>{activePage ? `${formatNumber(activePage.fanCount)} lượt thích · ${formatNumber(activePage.followers)} người theo dõi · ${canPublish ? "Bạn có quyền đăng" : "Bạn chỉ có quyền xem"}` : "Đăng bài, Reels và lên lịch trực tiếp từ TubeFlow, theo dõi số liệu và doanh thu Trang."}</p>
        </div>
        <div className="fb-hero-actions">
          {status?.connected && <span className={`fb-status-pill ${status.reconnectRequired ? "warn" : "ok"}`}>{status.reconnectRequired ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}{status.reconnectRequired ? "Cần kết nối lại" : "Đã kết nối"}</span>}
          <button type="button" className="fb-button primary" onClick={() => { setPrefill(null); setTab("compose"); }} disabled={!status?.connected || !canPublish}><Plus size={15} />Soạn nội dung</button>
        </div>
      </header>

      {(!status?.connected || status.reconnectRequired) && (
        <section className="fb-connect-hero">
          <div className="fb-connect-art" aria-hidden="true"><Share2 size={34} /><span /></div>
          <div>
            <h2>{status?.reconnectRequired ? "Kết nối Facebook đã hết hạn" : "Chưa kết nối Trang Facebook"}</h2>
            <p>Kết nối, chọn Trang và kiểm tra quyền tại Kết nối kênh, cùng nơi bạn quản lý YouTube.</p>
            <div className="fb-connect-actions"><button type="button" className="fb-button primary" onClick={() => onNavigate("connections")}><Link2 size={15} />Đi tới Kết nối kênh</button></div>
          </div>
        </section>
      )}

      <nav className="fb-tabs" aria-label="Khu vực Facebook">
        {TABS.map((item) => { const Icon = item.icon; return (
          <button key={item.id} type="button" aria-pressed={tab === item.id} className={tab === item.id ? "is-active" : ""} onClick={() => setTab(item.id)} disabled={!status?.connected && item.id !== "policy"}>
            <Icon size={15} />{item.label}
            {item.id === "posts" && scheduledCount > 0 && <span className="fb-count">{scheduledCount}</span>}
            {item.id === "posts" && failedCount > 0 && <span className="fb-count bad">{failedCount}</span>}
          </button>); })}
      </nav>

      {tab === "overview" && status?.connected && (
        <div className="fb-grid-two">
          <section className="fb-card">
            <header className="fb-card-head"><div><h2>Số liệu Trang</h2><p>Đọc trực tiếp từ Meta</p></div><button type="button" className="fb-icon-button" onClick={() => void loadOverview()} aria-label="Làm mới số liệu"><RefreshCw size={15} /></button></header>
            {overviewError ? <p className="fb-error-text">{overviewError}</p> : overview ? (
              <div className="fb-stats">
                <div><Users size={18} /><strong>{formatNumber(overview.page.fanCount)}</strong><span>Lượt thích</span></div>
                <div><Users size={18} /><strong>{formatNumber(overview.page.followers)}</strong><span>Người theo dõi</span></div>
                <div><FileText size={18} /><strong>{overview.posts.length}</strong><span>Bài gần đây</span></div>
              </div>
            ) : <div className="fb-skeleton-row"><Loader2 size={18} className="spin" />Đang tải…</div>}
          </section>
          <section className="fb-card">
            <header className="fb-card-head"><div><h2>Hành động nhanh</h2><p>Đi đến việc cần làm</p></div></header>
            <div className="fb-quick-grid">
              <button type="button" onClick={() => setTab("compose")} disabled={!canPublish}><FileText size={18} /><strong>Đăng bài viết</strong><small>Văn bản, ảnh, video, Reels</small></button>
              <button type="button" onClick={() => setTab("posts")}><CalendarClock size={18} /><strong>Lịch đăng</strong><small>{scheduledCount} bài đang chờ</small></button>
              <button type="button" onClick={() => setTab("earnings")}><Wallet size={18} /><strong>Doanh thu</strong><small>Đồng bộ và nhập số liệu</small></button>
              <button type="button" onClick={() => onNavigate("studio")}><Clapperboard size={18} /><strong>YouTube Studio</strong><small>Chuyển sang kênh YouTube</small></button>
            </div>
          </section>
          <section className="fb-card fb-span-2">
            <header className="fb-card-head"><div><h2>Bài gần đây trên Trang</h2><p>Tương tác từ Facebook</p></div></header>
            {overview?.posts.length ? (
              <ul className="fb-feed">
                {overview.posts.map((post) => (
                  <li key={post.id}>
                    <div><p>{post.message ? post.message.slice(0, 180) : <em>Bài không có chữ</em>}</p><small>{new Date(post.createdAt).toLocaleString("vi-VN")}</small></div>
                    <div className="fb-feed-metrics"><span>{formatNumber(post.likes)} thích</span><span>{formatNumber(post.comments)} bình luận</span><span>{formatNumber(post.shares)} chia sẻ</span></div>
                    {post.permalink && <a href={post.permalink} target="_blank" rel="noopener noreferrer" className="fb-icon-button" aria-label="Mở bài trên Facebook"><ExternalLink size={14} /></a>}
                  </li>
                ))}
              </ul>
            ) : <p className="fb-muted">Chưa có bài nào được tải từ Trang.</p>}
          </section>
        </div>
      )}

      {tab === "compose" && status?.connected && (
        canPublish ? (
          <FacebookComposer key={prefill?.sourceLabel ?? "fresh"} status={status} prefill={prefill} onNavigate={onNavigate} notify={notify} onPosted={() => { setPrefill(null); void loadPosts(); setTab("posts"); }} />
        ) : (
          <section className="fb-card"><p className="fb-error-text">Tài khoản của bạn chưa có quyền tạo nội dung trên “{activePage?.name}”. Nhờ Quản trị viên của Trang cấp vai trò Biên tập viên hoặc Quản trị viên, hoặc chọn Trang khác trong tab Kết nối Trang.</p></section>
        )
      )}

      {tab === "posts" && status?.connected && (
        <section className="fb-card">
          <header className="fb-card-head"><div><h2>Lịch đăng & lịch sử</h2><p>{posts.length} mục · lên lịch qua Facebook, bản nháp lưu tại TubeFlow</p></div><button type="button" className="fb-button" onClick={() => setTab("compose")}><Plus size={14} />Bài mới</button></header>
          {sortedPosts.length === 0 ? (
            <div className="fb-empty"><CalendarClock size={28} /><h3>Chưa có bài nào</h3><p>Soạn bài đầu tiên hoặc chuyển nội dung từ YouTube sang Facebook.</p></div>
          ) : (
            <ul className="fb-post-list">
              {sortedPosts.map((post) => (
                <PostRow key={post.id} post={post} onDelete={() => void removePost(post)} onSaveDraft={(text) => void saveDraft(post, text)} />
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === "earnings" && status?.connected && (
        <EarningsPanel earnings={earnings} status={status} syncing={syncing} onSync={() => void syncEarnings()} onChanged={() => void loadEarnings()} notify={notify} />
      )}

      {tab === "policy" && <PolicyCenter posts={posts} />}

    </div>
  );
}

function PostRow({ post, onDelete, onSaveDraft }: { post: FbPost; onDelete: () => void; onSaveDraft: (text: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(post.message);
  const when = post.scheduledAt ?? post.publishedAt ?? post.createdAt;
  const gradeTone = post.policyGrade.startsWith("A") ? "good" : post.policyGrade === "B" || post.policyGrade === "C" ? "warn" : "bad";
  return (
    <li className={`fb-post-row status-${post.status}`}>
      <span className="fb-post-kind">{FB_KIND_LABELS[post.kind as FbKind] ?? post.kind}</span>
      <div className="fb-post-body">
        {editing ? (
          <div className="fb-inline-edit">
            <textarea value={text} onChange={(event) => setText(event.target.value)} rows={4} aria-label="Sửa bản nháp" />
            <div><button type="button" className="fb-button" onClick={() => setEditing(false)}>Huỷ</button><button type="button" className="fb-button primary" onClick={() => { onSaveDraft(text); setEditing(false); }}>Lưu nháp</button></div>
          </div>
        ) : (
          <p>{post.message ? post.message.slice(0, 220) : <em>{post.mediaName ? `Tệp: ${post.mediaName}` : "Không có nội dung"}</em>}</p>
        )}
        <small>
          <span className={`fb-status-badge ${post.status}`}>{STATUS_LABEL[post.status]}</span>
          {when && <> · {new Date(when).toLocaleString("vi-VN")}</>}
          {post.pageName && <> · {post.pageName}</>}
        </small>
        {post.error && <small className="fb-error-text">Lỗi: {post.error}</small>}
      </div>
      <span className={`fb-grade ${gradeTone}`} title="Điểm kiểm tra chính sách tại thời điểm soạn">{post.policyScore}</span>
      <div className="fb-row-actions">
        {post.permalink && <a href={post.permalink} target="_blank" rel="noopener noreferrer" className="fb-icon-button" aria-label="Mở trên Facebook"><ExternalLink size={14} /></a>}
        {post.status === "draft" && !editing && <button type="button" className="fb-icon-button" onClick={() => setEditing(true)} aria-label="Sửa bản nháp"><FileText size={14} /></button>}
        {post.status !== "published" && <button type="button" className="fb-icon-button danger" onClick={onDelete} aria-label="Xoá"><Trash2 size={14} /></button>}
      </div>
    </li>
  );
}

function EarningsPanel({ earnings, status, syncing, onSync, onChanged, notify }: { earnings: FbEarningsResponse | null; status: FbStatus; syncing: boolean; onSync: () => void; onChanged: () => void; notify: (message: string, error?: boolean) => void }) {
  const [csv, setCsv] = useState("");
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [manual, setManual] = useState({ date: new Date().toISOString().slice(0, 10), amount: "", currency: "USD", source: "Meta", note: "" });
  const [importing, setImporting] = useState(false);
  const maxMonth = Math.max(1, ...(earnings?.summary.byMonth.map((item) => Number(item.amount)) ?? [1]));
  const preview = csv.trim() ? parseEarningsCsv(csv) : null;

  async function importCsv() {
    setImporting(true); setCsvErrors([]);
    try {
      const response = await fetch("/api/facebook/earnings/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv }) });
      const body = await response.json().catch(() => ({})) as { inserted?: number; skipped?: number; errors?: string[]; error?: string };
      if (!response.ok) { setCsvErrors(body.errors ?? [body.error ?? "Không nhập được."]); notify(body.error ?? "Không nhập được CSV.", true); return; }
      setCsvErrors(body.errors ?? []);
      notify(`Đã nhập ${body.inserted} dòng${body.skipped ? `, bỏ qua ${body.skipped} dòng trùng` : ""}.`);
      setCsv("");
      onChanged();
    } finally { setImporting(false); }
  }

  async function addManual(event: FormEvent) {
    event.preventDefault();
    if (!isValidDate(manual.date) || !isValidAmount(manual.amount.replace(/\s/g, ""))) { notify("Kiểm tra lại ngày và số tiền (dùng dấu chấm cho số thập phân).", true); return; }
    const response = await fetch("/api/facebook/earnings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...manual, date: normalizeIsoDate(manual.date) }) });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) { notify(body.error || "Không lưu được.", true); return; }
    notify("Đã thêm khoản doanh thu.");
    setManual({ ...manual, amount: "", note: "" });
    onChanged();
  }

  async function remove(id: string) {
    if (!window.confirm("Xoá khoản này khỏi TubeFlow?")) return;
    const response = await fetch(`/api/facebook/earnings/${id}`, { method: "DELETE" });
    if (!response.ok) { notify("Không xoá được.", true); return; }
    onChanged();
  }

  return (
    <div className="fb-earnings">
      <section className="fb-card fb-earn-hero">
        <div>
          <span className="fb-eyebrow"><Wallet size={13} />DOANH THU FACEBOOK</span>
          <strong className="fb-earn-total">{money(earnings?.summary.total ?? "0")}</strong>
          <p>{earnings?.syncedAt ? `Đồng bộ Meta lần cuối: ${new Date(earnings.syncedAt).toLocaleString("vi-VN")}` : "Chưa đồng bộ từ Meta. Bạn vẫn có thể nhập CSV hoặc nhập tay."}</p>
        </div>
        <button type="button" className="fb-button primary" onClick={onSync} disabled={syncing || !status.connected}>{syncing ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}Đồng bộ từ Meta</button>
      </section>

      <div className="fb-grid-two">
        <section className="fb-card">
          <header className="fb-card-head"><div><h2>Theo tháng</h2><p>Tổng hợp từ mọi nguồn</p></div></header>
          {earnings?.summary.byMonth.length ? (
            <ul className="fb-bars">
              {earnings.summary.byMonth.map((item) => (
                <li key={item.month}><span>{item.month}</span><div><i style={{ width: `${Math.max(4, (Number(item.amount) / maxMonth) * 100)}%` }} /></div><strong>{money(item.amount)}</strong></li>
              ))}
            </ul>
          ) : <p className="fb-muted">Chưa có số liệu.</p>}
          {earnings?.summary.bySource.length ? <div className="fb-tags">{earnings.summary.bySource.map((item) => <span key={item.source} className="fb-tag static">{item.source}: {money(item.amount)}</span>)}</div> : null}
        </section>

        <section className="fb-card">
          <header className="fb-card-head"><div><h2>Điều kiện kiếm tiền</h2><p>Cần biết trước khi kỳ vọng</p></div></header>
          <ul className="fb-checklist">
            <li className={status.grantedScopes.includes("read_insights") ? "pass" : "todo"}>{status.grantedScopes.includes("read_insights") ? <CheckCircle2 size={15} /> : <span className="fb-dot" />}<span>Đã cấp quyền đọc chỉ số (read_insights)</span></li>
            <li className={activeIsAdmin(status) ? "pass" : "todo"}>{activeIsAdmin(status) ? <CheckCircle2 size={15} /> : <span className="fb-dot" />}<span>Bạn là Quản trị viên của Trang (Meta chỉ trả dữ liệu kiếm tiền cho Admin)</span></li>
            <li className="todo"><span className="fb-dot" /><span>Trang đã đủ điều kiện kiếm tiền theo Meta. TubeFlow không suy đoán điều kiện này; xem trong Meta Business Suite.</span></li>
            <li className="todo"><span className="fb-dot" /><span>Nội dung là sản phẩm gốc. Nội dung tái đăng hoặc không đúng quyền không được tính.</span></li>
          </ul>
        </section>

        <section className="fb-card fb-span-2">
          <header className="fb-card-head"><div><h2>Nhập từ CSV</h2><p>Xuất từ Meta Business Suite hoặc chuẩn bị bằng Excel. Cột: ngày, số tiền, tiền tệ, nguồn, ghi chú</p></div></header>
          <div className="fb-csv-grid">
            <div>
              <textarea className="fb-code-area" rows={8} value={csv} onChange={(event) => setCsv(event.target.value)} placeholder={"ngay,so_tien,tien_te,nguon,ghi_chu\n2026-10-01,125.50,USD,Meta,Tháng 10 tuần 1\n05/10/2026,80,USD,Reels,Thưởng Reels"} aria-label="Nội dung CSV" />
              <div className="fb-row-actions wrap">
                <label className="fb-button"><Upload size={14} />Chọn tệp CSV<input type="file" accept=".csv,text/csv" hidden onChange={async (event) => { const file = event.target.files?.[0]; if (file) setCsv(await file.text()); event.target.value = ""; }} /></label>
                <button type="button" className="fb-button primary" onClick={() => void importCsv()} disabled={importing || !csv.trim()}>{importing ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}Nhập dữ liệu</button>
              </div>
            </div>
            <div className="fb-csv-side">
              {preview && <p className="fb-muted">Xem trước: {preview.rows.length} dòng hợp lệ{preview.errors.length ? `, ${preview.errors.length} dòng lỗi` : ""}.</p>}
              {[...csvErrors, ...(preview?.errors ?? [])].slice(0, 6).map((error) => <p key={error} className="fb-error-text">{error}</p>)}
              <small className="fb-muted">Dòng đã nhập sẽ không bị nhân đôi nếu bạn nhập lại cùng một tệp.</small>
            </div>
          </div>
        </section>

        <section className="fb-card">
          <header className="fb-card-head"><div><h2>Nhập tay</h2><p>Sao chép con số từ trang kiếm tiền của Meta</p></div></header>
          <form className="fb-manual" onSubmit={addManual}>
            <label><span>Ngày</span><input type="date" value={manual.date} onChange={(event) => setManual({ ...manual, date: event.target.value })} required /></label>
            <label><span>Số tiền</span><input inputMode="decimal" value={manual.amount} onChange={(event) => setManual({ ...manual, amount: event.target.value })} placeholder="125.50" required /></label>
            <label><span>Tiền tệ</span><select value={manual.currency} onChange={(event) => setManual({ ...manual, currency: event.target.value })}><option>USD</option><option>VND</option><option>EUR</option></select></label>
            <label><span>Nguồn</span><select value={manual.source} onChange={(event) => setManual({ ...manual, source: event.target.value })}>{EARNING_SOURCES.map((source) => <option key={source}>{source}</option>)}</select></label>
            <label className="wide"><span>Ghi chú</span><input value={manual.note} onChange={(event) => setManual({ ...manual, note: event.target.value })} maxLength={300} /></label>
            <button type="submit" className="fb-button primary wide"><Plus size={14} />Thêm khoản thu</button>
          </form>
        </section>

        <section className="fb-card fb-span-2">
          <header className="fb-card-head"><div><h2>Chi tiết</h2><p>{earnings?.entries.length ?? 0} bản ghi</p></div></header>
          {earnings?.entries.length ? (
            <div className="fb-table-wrap"><table className="fb-table">
              <thead><tr><th>Ngày</th><th>Số tiền</th><th>Nguồn</th><th>Ghi chú</th><th /></tr></thead>
              <tbody>{earnings.entries.map((entry) => (
                <tr key={entry.id}><td>{entry.periodStart}</td><td><strong>{money(entry.amount, entry.currency)}</strong></td><td><span className={`fb-tag static ${entry.source}`}>{entry.source === "meta_api" ? "Meta" : entry.source === "csv_import" ? "CSV" : "Nhập tay"}</span></td><td>{entry.note}</td><td><button type="button" className="fb-icon-button danger" onClick={() => void remove(entry.id)} aria-label="Xoá khoản này"><Trash2 size={14} /></button></td></tr>
              ))}</tbody>
            </table></div>
          ) : <p className="fb-muted">Chưa có khoản nào. Đồng bộ từ Meta, nhập CSV hoặc nhập tay để bắt đầu theo dõi.</p>}
        </section>
      </div>
    </div>
  );
}

function activeIsAdmin(status: FbStatus) {
  const page = status.pages.find((item) => item.id === status.activePageId);
  return !!page && page.tasks.includes("MANAGE");
}

function PolicyCenter({ posts }: { posts: FbPost[] }) {
  const areas = useMemo(() => {
    const count = new Map<string, number>();
    for (const post of posts) for (const finding of post.policyFindings) count.set(finding.area, (count.get(finding.area) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]);
  }, [posts]);
  const rules = [
    { title: "Thu hút tương tác giả", body: "Không yêu cầu like, chia sẻ, bình luận hoặc gắn thẻ để nhận quà. Thay bằng câu hỏi mở tự nhiên." },
    { title: "Lừa đảo & tài chính", body: "Không hứa thu nhập chắc chắn, không quảng cáo “làm giàu nhanh”, không tuyển cộng tác viên kiểu đa cấp." },
    { title: "Sức khoẻ", body: "Không khẳng định chữa khỏi bệnh hoặc thay thế bác sĩ. Ghi rõ đây là kinh nghiệm cá nhân." },
    { title: "Nội dung có thương hiệu", body: "Bài có hợp tác hoặc tài trợ phải bật công cụ Nội dung có thương hiệu trong Meta trước khi đăng." },
    { title: "Tính gốc để kiếm tiền", body: "Nội dung tái đăng hoặc lấy của người khác không đủ điều kiện. Ghi nguồn và thêm góc nhìn riêng." },
    { title: "Thông tin cá nhân", body: "Không công khai số điện thoại, số tài khoản ngân hàng hay giấy tờ của người khác." },
  ];
  return (
    <div className="fb-grid-two">
      <section className="fb-card">
        <header className="fb-card-head"><div><h2>Các lỗi thường gặp của Trang</h2><p>Thống kê từ lịch sử soạn bài</p></div></header>
        {areas.length ? <ul className="fb-bars">{areas.map(([area, count]) => <li key={area}><span>{area}</span><div><i style={{ width: `${Math.min(100, count * 20)}%` }} /></div><strong>{count}</strong></li>)}</ul> : <p className="fb-muted">Chưa có cảnh báo nào. Các bài soạn sau này sẽ được tổng hợp tại đây.</p>}
      </section>
      <section className="fb-card">
        <header className="fb-card-head"><div><h2>Nguyên tắc cần nhớ</h2><p>Tóm tắt, không thay thế chính sách chính thức</p></div></header>
        <ul className="fb-rules">{rules.map((rule) => <li key={rule.title}><ChevronRight size={14} /><div><strong>{rule.title}</strong><span>{rule.body}</span></div></li>)}</ul>
        <p className="fb-muted fb-disclaimer">Kiểm tra của TubeFlow là bước sàng lọc sớm dựa trên luật. Quyết định cuối cùng thuộc về Meta. Đọc Tiêu chuẩn cộng đồng và chính sách Kiếm tiền nội dung của Meta trước khi đăng nội dung quan trọng.</p>
      </section>
    </div>
  );
}
