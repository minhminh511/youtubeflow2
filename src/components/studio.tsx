"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowRight, ArrowUpRight, Bell, Check, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, Command, Info, Layers2, Link2, Loader2, Plus, RefreshCw, Search, ShieldCheck, Smartphone, Sparkles, X } from "lucide-react";
import { BrandMark } from "@/components/ui";
import { Connections } from "@/components/connections";
import { Planner } from "@/components/planner";
import { Analytics, Settings } from "@/components/workspace-views";
import { WorkspaceOverview } from "@/components/workspace-overview";
import { StudioWorkspace } from "@/components/studio-workspace";
import { StrategyView } from "@/components/strategy-view";
import { MonetizationView } from "@/components/monetization-view";
import { MediaEditor } from "@/components/media-editor";
import { FacebookView } from "@/components/facebook-view";
import { TikTokView } from "@/components/tiktok-view";
import { CommandPalette } from "@/components/command-palette";
import { HelpDialog } from "@/components/help-dialog";
import { MobileNavigation, QuickCreateDialog } from "@/components/mobile-navigation";
import { ConnectivityNotice, InstallBanner, PwaInstallDialog, PwaSettingsCard, PwaUpdateDialog } from "@/components/pwa-experience";
import { usePwa } from "@/lib/use-pwa";
import { requestJson } from "@/lib/client";
import { NAVIGATION_GROUPS, VIEW_LABELS, WORKSPACE_SETTINGS } from "@/lib/navigation";
import type { Plan, PublicConfig, View, WorkspaceData } from "@/lib/types";
import { isView } from "@/lib/types";

const oauthMessages: Record<string, string> = {
  success: "Kết nối YouTube thành công! Chào mừng kênh của bạn đến với TubeFlow.",
  access_denied: "Bạn chưa cấp quyền truy cập. Có thể thử lại khi sẵn sàng; nếu ứng dụng đang Testing, kiểm tra email trong Test users.",
  invalid_state: "Phiên xác thực đã hết hạn hoặc không hợp lệ. Hãy bắt đầu kết nối lại từ trình duyệt này.",
  missing_config: "Máy chủ chưa có đủ cấu hình Google OAuth. Hãy làm theo 4 bước thiết lập.",
  wrong_origin: "Địa chỉ đang mở khác APP_URL. Mở đúng URL triển khai hoặc cập nhật APP_URL và triển khai lại.",
  unauthorized: "Không tìm thấy phiên làm việc. Hãy cho phép cookie, tải lại trang rồi kết nối lại.",
  no_channel: "Tài khoản Google này chưa có kênh YouTube. Hãy chọn tài khoản quản lý kênh hoặc tạo kênh trước.",
  google_api: "Không đọc được dữ liệu kênh. Kiểm tra đã bật YouTube Data API v3 và YouTube Analytics API trong đúng dự án.",
  token_exchange: "Không đổi được mã xác thực. Kiểm tra Client ID, Client Secret và redirect URI, rồi thử kết nối lại.",
  offline_access: "Google chưa cấp refresh token. Hãy kết nối lại và cấp quyền truy cập đầy đủ.",
  missing_scopes: "Chưa được cấp đủ quyền. Kết nối lại và chọn cả quyền đọc YouTube lẫn YouTube Analytics.",
  connection_failed: "Chưa thể hoàn tất kết nối. Kiểm tra cấu hình Google Cloud và thử lại.",
};

type StudioRoute = { tab?: string; videoId?: string; planId?: string };

export function Studio({ initialConfig, initialView = "overview" }: { initialConfig: PublicConfig; initialView?: View }) {
  const pwa = usePwa();
  const [view, setView] = useState<View>(initialView);
  const [config, setConfig] = useState(initialConfig);
  const [data, setData] = useState<WorkspaceData>({ name: "Không gian của tôi", completedSteps: [], plans: [], channel: null, videos: [] });
  const [initialized, setInitialized] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [reloading, setReloading] = useState(false);
  const [popover, setPopover] = useState<"workspace" | "notifications" | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpTopic, setHelpTopic] = useState("guide");
  const [guideRequest, setGuideRequest] = useState(0);
  const [plannerRequest, setPlannerRequest] = useState(0);
  const [plannerDate, setPlannerDate] = useState<string | undefined>();
  const [plannerPlanId, setPlannerPlanId] = useState<string | undefined>();
  const requestCounter = useRef(0);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const previousOnline = useRef(true);
  const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((message: string, error = false) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, error });
    toastTimer.current = setTimeout(() => setToast(null), error ? 10000 : 6000);
  }, []);

  const loadWorkspace = useCallback(async () => {
    setReloading(true);
    try {
      const workspace = await requestJson<WorkspaceData>("/api/workspace");
      setData(workspace); setInitialized(true); setLoadError("");
    } catch (error) { setLoadError((error as Error).message); }
    finally { setReloading(false); }
  }, []);

  useEffect(() => {
    // Browser location and install/OAuth flags are read after hydration.
    const initialFrame = requestAnimationFrame(() => {
      void loadWorkspace();
      const url = new URL(window.location.href);
    const requestedView = url.searchParams.get("view");
    if (isView(requestedView)) setView(requestedView);
    if (url.searchParams.get("install") === "1") {
      setInstallOpen(true); url.searchParams.delete("install");
    }
    const oauth = url.searchParams.get("oauth");
    if (oauth) {
      notify(oauthMessages[oauth] || oauthMessages.connection_failed, oauth !== "success");
      setView("connections"); url.searchParams.set("view", "connections"); url.searchParams.delete("oauth");
    }
      window.history.replaceState({}, "", `${url.pathname}${url.search}`);
    });
    previousOnline.current = navigator.onLine;
    const onOffline = () => { previousOnline.current = false; };
    const onOnline = () => {
      if (previousOnline.current) return;
      previousOnline.current = true;
      notify("Thiết bị đã có mạng trở lại. Bạn có thể tiếp tục lưu nội dung.");
      if (!document.querySelector('[role="dialog"]')) void loadWorkspace();
    };
    const onPopstate = () => {
      const next = new URL(window.location.href).searchParams.get("view");
      setView(isView(next) ? next : "overview"); setPlannerRequest(0); setPopover(null);
    };
    const onOutside = (event: MouseEvent) => { if (!(event.target as Element)?.closest("[data-popover]")) setPopover(null); };
    const onEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setPopover(null); };
    const onCommand = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (document.querySelector('[role="dialog"]') && !document.querySelector(".command-palette")) return;
        setCommandOpen((current) => !current); setPopover(null);
      }
    };
    window.addEventListener("popstate", onPopstate);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("click", onOutside);
    document.addEventListener("keydown", onEscape);
    document.addEventListener("keydown", onCommand);
    return () => {
      cancelAnimationFrame(initialFrame);
      window.removeEventListener("popstate", onPopstate);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("click", onOutside);
      document.removeEventListener("keydown", onEscape);
      document.removeEventListener("keydown", onCommand);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [loadWorkspace, notify]);

  useEffect(() => { document.title = `${VIEW_LABELS[view]} · TubeFlow`; }, [view]);

  function navigate(next: View, route?: StudioRoute) {
    setView(next); setPopover(null); setPlannerRequest(0); setPlannerPlanId(undefined); setPlannerDate(undefined);
    const url = new URL(window.location.href);
    if (next === "overview") url.searchParams.delete("view"); else url.searchParams.set("view", next);
    url.searchParams.delete("tab"); url.searchParams.delete("video"); url.searchParams.delete("plan"); url.searchParams.delete("fb");
    if (route?.tab) url.searchParams.set("tab", route.tab);
    if (route?.videoId) url.searchParams.set("video", route.videoId);
    if (route?.planId) url.searchParams.set("plan", route.planId);
    window.history.pushState({}, "", `${url.pathname}${url.search}`);
    window.dispatchEvent(new CustomEvent("tubeflow:studio-route"));
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function createContent(date?: string) {
    navigate("planner"); setPlannerDate(date); setPlannerRequest(++requestCounter.current);
  }
  function createIdea() {
    navigate("ideas"); setPlannerRequest(++requestCounter.current);
  }
  function openPlan(plan: Plan) {
    navigate(plan.status === "idea" ? "ideas" : "planner");
    setPlannerPlanId(plan.id); setPlannerRequest(++requestCounter.current);
  }
  function openUpload() { navigate("studio", { tab: "upload" }); }
  function openVideo(videoId: string) { navigate("studio", { tab: "videos", videoId }); }
  function showHelp(topic = "guide") { setHelpTopic(topic); setHelpOpen(true); setPopover(null); }
  function openGuide() { setHelpOpen(false); navigate("connections"); setGuideRequest((value) => value + 1); }
  function openInstall() { setPopover(null); setInstallOpen(true); }
  const hasNotification = !config.ready || !data.channel;
  const notifications = Number(hasNotification) + Number(pwa.updateAvailable);
  const workspaceName = data.name === "Không gian của tôi" ? "Workspace cá nhân" : data.name;
  const profileName = data.channel?.title || "Nhà sáng tạo";
  const initials = data.channel?.title ? data.channel.title.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("") : "TF";
  const ideasCount = data.plans.filter((plan) => plan.status === "idea").length;

  return (
    <div className="app-shell creator-shell" data-app-mode={pwa.standalone ? "standalone" : "browser"}>
      <a href="#main-content" className="skip-link">Đến nội dung chính</a>
      <aside className="sidebar creator-sidebar" aria-label="Thanh bên không gian">
        <button className="creator-brand" onClick={() => navigate("overview")} aria-label="TubeFlow — về trang tổng quan"><BrandMark /><span>Tube<span>Flow</span><i /></span></button>
        <div className="creator-workspace-switch" data-popover>
          <button className="workspace-selector" aria-expanded={popover === "workspace"} onClick={() => setPopover(popover === "workspace" ? null : "workspace")}><span className="workspace-selector-icon"><Layers2 size={17} strokeWidth={1.7} /></span><span><strong>{workspaceName}</strong><small>Creator workspace</small></span><ChevronDown size={14} /></button>
          {popover === "workspace" && <div className="creator-workspace-popover"><span className="section-kicker">KHÔNG GIAN HIỆN TẠI</span><div><Layers2 size={18} /><strong>{data.name}</strong><Check size={16} /></div><p>Dữ liệu riêng, nhận diện bằng cookie trên trình duyệt này.</p><button onClick={() => navigate("settings")}>Quản lý không gian<ArrowRight size={14} /></button></div>}
        </div>
        <nav className="creator-side-navigation" aria-label="Điều hướng chính">{NAVIGATION_GROUPS.map((group) => <div className="side-nav-group" key={group.label}><p>{group.label}</p>{group.items.map((item) => <button key={item.id} onClick={() => navigate(item.id)} className={`side-nav-item ${view === item.id ? "active" : ""}`} aria-current={view === item.id ? "page" : undefined}><item.icon size={18} strokeWidth={1.7} /><span>{item.label}</span>{item.id === "ideas" && ideasCount > 0 && <span className="side-nav-count">{ideasCount}</span>}{view === item.id && <i />}</button>)}</div>)}</nav>
        <div className="creator-sidebar-bottom">
          <div className="sidebar-inspiration"><span><Sparkles size={15} /></span><strong>Mỗi ý tưởng đều đáng giá.</strong><p>Tạo không gian cho câu chuyện tiếp theo của bạn.</p><button onClick={() => navigate("strategy")}>Tìm cảm hứng<ArrowUpRight size={13} /></button><i /></div>
          <div className="sidebar-settings">{WORKSPACE_SETTINGS.map((item) => <button className={`side-nav-item ${view === item.id ? "active" : ""}`} key={item.id} aria-current={view === item.id ? "page" : undefined} onClick={() => navigate(item.id)}><item.icon size={18} strokeWidth={1.7} /><span>{item.label}</span>{item.id === "connections" && <span className={`side-connection-dot ${data.channel ? "connected" : ""}`} />}</button>)}</div>
          <button className="sidebar-app-install" onClick={openInstall}><Smartphone size={16} /><span>{pwa.standalone ? "Ứng dụng TubeFlow" : "Mang TubeFlow theo bạn"}</span><ArrowUpRight size={13} /></button>
          <button className="creator-profile" onClick={() => navigate("settings")}><span className="creator-avatar">{data.channel?.thumbnail ? <Image src={data.channel.thumbnail} alt="" width={32} height={32} unoptimized /> : initials}<i /></span><span><strong>{profileName}</strong><small>Không gian cá nhân</small></span><ChevronDown size={14} /></button>
        </div>
      </aside>

      <div className="app-main creator-main">
        <header className="topbar creator-topbar">
          <div className="creator-topbar-left"><button className="mobile-wordmark" onClick={() => navigate("overview")} aria-label="TubeFlow — mở tổng quan"><BrandMark /><span>TubeFlow<i /></span></button><div className="creator-breadcrumbs"><span>Không gian sáng tạo</span><ChevronRight size={13} /><strong>{VIEW_LABELS[view]}</strong></div></div>
          <div className="creator-topbar-actions">
            <button className="workspace-search" onClick={() => setCommandOpen(true)} aria-label="Tìm kiếm nhanh"><Search size={16} /><span>Tìm kiếm trong không gian...</span><kbd><Command size={11} /> K</kbd></button>
            <span className="workspace-live-status"><i className={initialized && !loadError ? "ready" : ""} />Workspace cá nhân</span>
            <span className="creator-toolbar-divider" />
            <button className="toolbar-button refresh-workspace" aria-label="Làm mới dữ liệu không gian" title="Làm mới dữ liệu" onClick={() => void loadWorkspace()} disabled={reloading}><RefreshCw size={18} strokeWidth={1.6} className={reloading ? "spin" : ""} /></button>
            <button className="toolbar-button toolbar-help" aria-label="Trung tâm trợ giúp" onClick={() => showHelp()}><CircleHelp size={19} strokeWidth={1.6} /></button>
            <div className="creator-notification-container" data-popover>
              <button className={`toolbar-button notification-trigger ${popover === "notifications" ? "is-open" : ""}`} aria-label="Thông báo" aria-expanded={popover === "notifications"} onClick={() => setPopover(popover === "notifications" ? null : "notifications")}><Bell size={19} strokeWidth={1.6} />{notifications > 0 && <i />}</button>
              {popover === "notifications" && <div className="workspace-notifications"><header><strong>Thông báo</strong><span>{notifications} mới</span></header>{hasNotification && <button onClick={openGuide}><span className="notification-item-icon"><Link2 size={18} /></span><span><strong>{config.ready ? "Kết nối kênh của bạn" : "Thiết lập không gian YouTube"}</strong><small>{config.ready ? "Sẵn sàng mang dữ liệu kênh vào TubeFlow." : "Hoàn tất cấu hình để kết nối và đăng video."}</small><em>Xem hướng dẫn<ArrowRight size={12} /></em></span></button>}{pwa.updateAvailable && <button onClick={() => { setPopover(null); setUpdateOpen(true); }}><span className="notification-item-icon"><Sparkles size={18} /></span><span><strong>Có phiên bản mới</strong><small>Lưu nội dung đang làm rồi cập nhật TubeFlow.</small></span></button>}{!notifications && <div className="notification-clear"><CheckCircle2 size={26} /><p>Bạn đã cập nhật mọi thứ.</p></div>}<footer><ShieldCheck size={12} />Chỉ thông báo quan trọng cho không gian của bạn.</footer></div>}
            </div>
            <button className="topbar-profile" onClick={() => navigate("settings")} aria-label="Mở cài đặt không gian">{data.channel?.thumbnail ? <Image src={data.channel.thumbnail} alt="" width={32} height={32} unoptimized /> : initials}</button>
          </div>
        </header>

        <main className="main-content creator-main-content" id="main-content" data-view={view}>
          {loadError && <div className="load-error" role="alert"><Info size={18} /><span>{loadError}</span><button className="text-button" onClick={() => void loadWorkspace()} disabled={reloading}>{reloading ? <Loader2 size={14} className="spin" /> : "Thử lại"}</button></div>}
          <ConnectivityNotice online={pwa.online} />
          {pwa.updateAvailable && !updateDismissed && <div className="pwa-update-banner"><span><Sparkles size={16} />Phiên bản mới đã sẵn sàng.</span><button className="text-button" onClick={() => setUpdateOpen(true)}>Xem cập nhật</button><button className="icon-button" aria-label="Để thông báo cập nhật sau" onClick={() => setUpdateDismissed(true)}><X size={15} /></button></div>}
          <div className="creator-view-content">
            {view === "overview" && <WorkspaceOverview data={data} initialized={initialized} onNavigate={navigate} onCreate={createContent} onIdea={createIdea} onUpload={openUpload} onOpenPlan={openPlan} />}
            {view === "connections" && <Connections config={config} onConfigChange={setConfig} data={data} initialized={initialized} onStepsChange={(steps) => setData((current) => ({ ...current, completedSteps: steps }))} onChannelChange={(channel) => setData((current) => ({ ...current, channel }))} notify={notify} onNavigate={navigate} onHelp={showHelp} guideRequest={guideRequest} />}
            {view === "studio" && <StudioWorkspace data={data} config={config} onNavigate={navigate} onPlansChange={(plans) => setData((current) => ({ ...current, plans }))} onVideosChange={(videos) => setData((current) => ({ ...current, videos }))} notify={notify} />}
            {view === "facebook" && <FacebookView data={data} onNavigate={navigate} notify={notify} />}
        {view === "tiktok" && <TikTokView data={data} onNavigate={navigate} notify={notify} />}
        {view === "strategy" && <StrategyView data={data} onNavigate={navigate} onPlansChange={(plans) => setData((current) => ({ ...current, plans }))} notify={notify} />}
            {view === "monetization" && <MonetizationView connected={!!data.channel} onNavigate={navigate} notify={notify} />}
            {view === "editor" && <MediaEditor data={data} onNavigate={navigate} notify={notify} />}
            {(view === "planner" || view === "ideas") && <Planner key={`${view}:${plannerRequest}`} plans={data.plans} onChange={(plans) => setData((current) => ({ ...current, plans }))} mode={view} initialized={initialized} notify={notify} newRequest={plannerRequest} requestedDate={plannerDate} requestedPlanId={plannerPlanId} />}
            {view === "analytics" && <Analytics channel={data.channel} onNavigate={navigate} />}
            {view === "settings" && <Settings data={data} config={config} installation={<PwaSettingsCard pwa={pwa} onInstall={openInstall} onUpdate={() => setUpdateOpen(true)} />} onNameChange={(name) => setData((current) => ({ ...current, name }))} notify={notify} onNavigate={navigate} />}
          </div>
          {view !== "settings" && <div className="creator-install-strip"><InstallBanner pwa={pwa} onOpen={openInstall} /></div>}
          <footer className="creator-app-footer"><span>TubeFlow<span />Một không gian, nhiều khả năng.</span><nav className="creator-footer-legal" aria-label="Tài liệu pháp lý"><a href="/chinh-sach-bao-mat">Chính sách bảo mật của TubeFlow</a><a href="/dieu-khoan-su-dung">Điều khoản sử dụng của TubeFlow</a><button onClick={() => showHelp()}>Cần một chút trợ giúp?<ArrowUpRight size={12} /></button></nav></footer>
        </main>
      </div>

      <MobileNavigation view={view} onNavigate={navigate} onCreate={() => setQuickCreateOpen(true)} onInstall={openInstall} onHelp={() => showHelp()} />
      <QuickCreateDialog open={quickCreateOpen} onClose={() => setQuickCreateOpen(false)} onPlan={() => createContent()} onIdea={createIdea} onEditor={() => navigate("editor")} onUpload={openUpload} />
      {commandOpen && <CommandPalette open onClose={() => setCommandOpen(false)} data={data} onNavigate={navigate} onPlan={openPlan} onVideo={openVideo} />}
      <PwaInstallDialog open={installOpen} onClose={() => setInstallOpen(false)} pwa={pwa} onSettings={() => navigate("settings")} />
      <PwaUpdateDialog open={updateOpen} onClose={() => setUpdateOpen(false)} onConfirm={pwa.applyUpdate} />
      <HelpDialog open={helpOpen} topic={helpTopic} onClose={() => setHelpOpen(false)} onGuide={openGuide} />
      <button className="desktop-quick-create" onClick={() => setQuickCreateOpen(true)} aria-label="Mở menu tạo nhanh"><Plus size={19} /><span>Tạo nhanh</span></button>
      {toast && <div className={`toast ${toast.error ? "toast-error" : ""}`} role={toast.error ? "alert" : "status"}>{toast.error ? <Info size={19} /> : <CheckCircle2 size={19} />}<span>{toast.message}</span><button onClick={() => setToast(null)} aria-label="Đóng thông báo"><X size={17} /></button></div>}
    </div>
  );
}
