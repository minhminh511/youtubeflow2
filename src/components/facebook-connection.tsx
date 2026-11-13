"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Link2, Loader2, LockKeyhole, RefreshCw, Share2, ShieldCheck, Unplug, X } from "lucide-react";
import { CopyButton, Modal } from "@/components/ui";
import { fetchWithSession, formatNumber } from "@/lib/client";
import type { FbStatus } from "@/lib/facebook-types";

/** Messages for the ?fb= flag that the Facebook OAuth callback leaves in the URL. */
export const FB_FLAG_MESSAGES: Record<string, { text: string; error: boolean }> = {
  success: { text: "Đã kết nối Facebook. Chọn Trang bạn muốn làm việc bên dưới.", error: false },
  partial: { text: "Đã kết nối, nhưng thiếu một số quyền. Kết nối lại và cấp đủ quyền để đăng và đọc số liệu.", error: true },
  no_page: { text: "Tài khoản này chưa quản lý Trang Facebook nào. Hãy tạo hoặc được thêm vào một Trang trước.", error: true },
  access_denied: { text: "Bạn đã huỷ cấp quyền. Có thể kết nối lại bất cứ lúc nào.", error: true },
  invalid_state: { text: "Phiên kết nối đã hết hạn hoặc không hợp lệ. Hãy bấm kết nối lại từ trình duyệt này.", error: true },
  missing_config: { text: "Máy chủ chưa có FACEBOOK_APP_ID và FACEBOOK_APP_SECRET. Xem hướng dẫn bên dưới.", error: true },
  connection_failed: { text: "Chưa hoàn tất kết nối với Facebook. Kiểm tra cấu hình ứng dụng Meta và thử lại.", error: true },
  unauthorized: { text: "Không tìm thấy phiên làm việc. Hãy tải lại trang rồi kết nối lại.", error: true },
};

/**
 * Facebook Pages connection, shown on the same page as the YouTube channel card so that every
 * platform link is managed in one place: connect, choose the active Page, reconnect or disconnect.
 */
export function FacebookConnectionCard({ notify }: { notify: (message: string, error?: boolean) => void }) {
  const [status, setStatus] = useState<FbStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchWithSession<FbStatus>("/api/facebook/status");
      if (data) setStatus(data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void load();
    const url = new URL(window.location.href);
    const flag = url.searchParams.get("fb");
    if (flag) {
      const message = FB_FLAG_MESSAGES[flag] ?? FB_FLAG_MESSAGES.connection_failed;
      notify(message.text, message.error);
      url.searchParams.delete("fb");
      window.history.replaceState({}, "", `${url.pathname}${url.search}`);
    }
  }, [load, notify]);

  const activePage = status?.pages.find((page) => page.id === status.activePageId) ?? null;
  const connected = !!status?.connected;

  async function switchPage(pageId: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/facebook/active", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pageId }) });
      const body = (await response.json().catch(() => ({}))) as FbStatus & { error?: string };
      if (!response.ok) throw new Error(body.error || "Không chuyển được Trang.");
      setStatus(body);
      notify("Đã chuyển Trang. Các màn hình Facebook sẽ dùng Trang này.");
    } catch (error) { notify(error instanceof Error ? error.message : "Không chuyển được Trang.", true); }
    finally { setBusy(false); }
  }

  async function disconnect() {
    setBusy(true);
    try {
      const response = await fetch("/api/facebook/disconnect", { method: "POST" });
      const body = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!response.ok) throw new Error(body.error || "Không ngắt được kết nối.");
      notify(body.message || "Đã ngắt kết nối Facebook.");
      setConfirmOpen(false);
      await load();
    } catch (error) { notify(error instanceof Error ? error.message : "Không ngắt được kết nối.", true); }
    finally { setBusy(false); }
  }

  const statusLabel = loading ? "Đang tải" : status?.reconnectRequired ? "Cần kết nối lại" : connected ? "Đã kết nối" : "Chưa kết nối";
  const statusClass = connected && !status?.reconnectRequired ? "status-green" : status?.reconnectRequired ? "status-amber" : "status-neutral";

  return (
    <div className="platform-connection-stack" id="facebook-connection">
      <section className="channel-card card facebook-connection-card">
        <div className="facebook-app-icon" aria-hidden="true"><Share2 size={24} /></div>
        <div className="channel-main">
          <div className="channel-title">
            <h2>{activePage ? activePage.name : "Facebook Pages"}</h2>
            <span className={`status-pill ${statusClass}`}><span />{statusLabel}</span>
          </div>
          <p>
            {status?.reconnectRequired
              ? "Token Facebook đã hết hạn hoặc bị thu hồi. Kết nối lại để tiếp tục đăng và đọc số liệu."
              : connected && activePage
                ? `Đang làm việc với Trang này · ${formatNumber(activePage.fanCount)} lượt thích · ${formatNumber(activePage.followers)} người theo dõi.`
                : "Đăng bài, Reels và lên lịch lên Trang Facebook. Chọn Trang và kiểm tra chính sách trước khi đăng."}
          </p>
          <div className="channel-features">
            <span><ShieldCheck size={14} />Token mã hoá trên máy chủ</span>
            <span><CheckCircle2 size={14} />{status?.pages.length ?? 0} Trang đã kết nối</span>
          </div>
        </div>
        <div className="channel-actions">
          {connected ? (
            <>
              <a className="button button-primary" href="/api/facebook/connect"><RefreshCw size={16} />{status?.reconnectRequired ? "Kết nối lại" : "Thêm / kết nối lại"}</a>
              <button type="button" className="text-button muted" onClick={() => setConfirmOpen(true)} disabled={busy}><Unplug size={13} />Ngắt kết nối</button>
            </>
          ) : (
            <>
              <a className="button button-primary connect-button" href="/api/facebook/connect"><Link2 size={17} />Kết nối Facebook</a>
              <span className="secure-caption"><LockKeyhole size={12} />Đăng nhập chính thức qua Meta</span>
            </>
          )}
        </div>
      </section>

      {connected && (
        <section className="card platform-pages-card" aria-label="Danh sách Trang Facebook">
          <header className="platform-pages-head">
            <div><h3>Trang Facebook</h3><p>Chuyển qua lại giữa các Trang bất cứ lúc nào. Mỗi Trang có quyền riêng.</p></div>
            {busy && <Loader2 size={16} className="spin" />}
          </header>
          {status?.pages.length ? (
            <ul className="platform-page-list">
              {status.pages.map((page) => {
                const active = page.id === status.activePageId;
                const canWrite = page.tasks.includes("CREATE_CONTENT") || page.tasks.includes("MANAGE");
                return (
                  <li key={page.id} className={active ? "is-active" : ""}>
                    {page.picture ? <img src={page.picture} alt="" width={40} height={40} /> : <span className="facebook-page-avatar"><Share2 size={16} /></span>}
                    <div><strong>{page.name}</strong><small>{page.category || "Trang"} · {canWrite ? "Có quyền đăng" : "Chỉ xem"}</small></div>
                    {active ? <span className="status-pill status-green"><span />Đang dùng</span> : <button type="button" className="button button-secondary button-small" onClick={() => void switchPage(page.id)} disabled={busy}>Chuyển sang</button>}
                  </li>
                );
              })}
            </ul>
          ) : <p className="field-hint">Chưa có Trang nào. Kết nối lại và chọn đúng Trang khi Facebook hỏi quyền.</p>}
          {status?.missingScopes.length ? <p className="platform-warning"><AlertTriangle size={14} />Thiếu quyền: {status.missingScopes.join(", ")}. Kết nối lại và cấp đủ quyền.</p> : null}
        </section>
      )}

      <details className="card platform-setup-card">
        <summary>Thiết lập ứng dụng Meta (làm một lần)</summary>
        <ol>
          <li>Tạo ứng dụng loại <strong>Business</strong> trên Meta for Developers, thêm sản phẩm <strong>Facebook Login for Business</strong>.</li>
          <li>Settings &gt; Basic: sao chép App ID và App Secret vào <code>.env</code> dưới tên FACEBOOK_APP_ID và FACEBOOK_APP_SECRET.</li>
          <li>Thêm đúng từng ký tự URI sau vào Valid OAuth Redirect URIs:
            <div className="platform-copy-row"><code>{status?.redirectUri || "APP_URL/api/facebook/callback"}</code>{status?.redirectUri && <CopyButton text={status.redirectUri} compact label="Sao chép URI chuyển hướng Facebook" />}</div>
          </li>
          <li>Quyền cần có: pages_show_list, pages_read_engagement, pages_manage_posts, pages_manage_engagement, read_insights, business_management. Trước khi người ngoài dùng, Meta yêu cầu App Review.</li>
        </ol>
        {status && !status.configured && <p className="platform-warning"><X size={14} />Máy chủ chưa có FACEBOOK_APP_ID / FACEBOOK_APP_SECRET hợp lệ. Thêm vào .env rồi khởi động lại.</p>}
      </details>

      <Modal open={confirmOpen} onClose={() => !busy && setConfirmOpen(false)} title="Ngắt kết nối Facebook?" description="Bạn có thể kết nối lại bất cứ lúc nào.">
        <div className="disconnect-info"><Unplug size={26} /><p>TubeFlow sẽ xoá token Facebook đã lưu. <strong>Bài đã đăng trên Facebook và bản nháp trong TubeFlow vẫn được giữ.</strong></p></div>
        <div className="modal-actions">
          <button className="button button-secondary" onClick={() => setConfirmOpen(false)} disabled={busy}>Giữ kết nối</button>
          <button className="button button-danger" onClick={() => void disconnect()} disabled={busy}>{busy && <Loader2 size={15} className="spin" />}Ngắt kết nối</button>
        </div>
      </Modal>
    </div>
  );
}
