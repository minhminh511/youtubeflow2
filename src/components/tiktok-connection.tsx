"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, KeyRound, Link2, Loader2, LockKeyhole, Music4, RefreshCw, ShieldCheck, Unplug, X } from "lucide-react";
import { CopyButton, Modal } from "@/components/ui";
import { fetchWithSession, formatNumber } from "@/lib/client";
import type { TkStatus } from "@/lib/tiktok-types";

export const TT_FLAG_MESSAGES: Record<string, { text: string; error: boolean }> = {
  success: { text: "Đã kết nối TikTok. Tài khoản của bạn đã sẵn sàng trong TubeFlow.", error: false },
  partial: { text: "Đã kết nối TikTok, nhưng một số quyền chưa được cấp. Kết nối lại để có thể đăng video.", error: true },
  access_denied: { text: "Bạn đã huỷ cấp quyền cho TikTok. Có thể kết nối lại bất cứ lúc nào.", error: true },
  invalid_state: { text: "Phiên kết nối TikTok đã hết hạn hoặc không hợp lệ. Hãy bấm kết nối lại từ trình duyệt này.", error: true },
  missing_config: { text: "Máy chủ chưa có TIKTOK_CLIENT_KEY và TIKTOK_CLIENT_SECRET. Xem hướng dẫn bên dưới.", error: true },
  invalid_client_key: { text: "TubeFlow đã dừng trước khi chuyển sang TikTok: TIKTOK_CLIENT_KEY trên máy chủ không phải Client Key hợp lệ nên TikTok sẽ báo lỗi client_key. Xem chẩn đoán bên dưới.", error: true },
  connection_failed: { text: "Chưa hoàn tất kết nối với TikTok. Nguyên nhân cụ thể ở cuối thông báo này.", error: true },
  code_rejected: { text: "TikTok từ chối mã uỷ quyền. Mã chỉ dùng một lần và hết hạn sau vài phút — hãy bấm Kết nối TikTok lại từ đầu, đừng dùng lại tab TikTok cũ.", error: true },
  params_malformed: { text: "TikTok trả lời “request parameters are malformed” ở bước đổi mã thành token. Đây KHÔNG phải lỗi mã uỷ quyền — xem chi tiết và dấu vân tay khoá bên dưới.", error: true },
  unauthorized: { text: "Không tìm thấy phiên làm việc. Hãy tải lại trang rồi kết nối lại.", error: true },
};

/** TikTok connection card, shown beside the YouTube and Facebook cards on Kết nối kênh. */
export function TikTokConnectionCard({ notify }: { notify: (message: string, error?: boolean) => void }) {
  const [status, setStatus] = useState<TkStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verdict, setVerdict] = useState<null | { verdict: string; providerError: string | null; providerMessage: string | null; checkedAt: string; fingerprint: { length: number; masked: string; sha256Prefix: string }; secretFingerprint?: { length: number; masked: string; sha256Prefix: string }; redirectUri?: string; scopes?: string[]; environment?: string }>(null);
  // Steps that only exist inside the TikTok portal; remembered per browser so the checklist is useful.
  const [portalSteps, setPortalSteps] = useState<Record<string, boolean>>({});
  const [lastFailure, setLastFailure] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchWithSession<TkStatus>("/api/tiktok/status");
      if (data) setStatus(data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void load();
    try {
      const stored = window.localStorage.getItem("tubeflow.tiktok.portalSteps");
      if (stored) setPortalSteps(JSON.parse(stored) as Record<string, boolean>);
    } catch { /* private mode */ }
    const url = new URL(window.location.href);
    const flag = url.searchParams.get("tt");
    if (flag) {
      const message = TT_FLAG_MESSAGES[flag] ?? TT_FLAG_MESSAGES.connection_failed;
      const detail = url.searchParams.get("tt_detail");
      setLastFailure(detail);
      notify(detail ? `${message.text} TikTok trả về: ${detail}` : message.text, message.error);
      url.searchParams.delete("tt");
      url.searchParams.delete("tt_detail");
      window.history.replaceState({}, "", `${url.pathname}${url.search}`);
    }
  }, [load, notify]);

  async function verifyKey() {
    setVerifying(true);
    setVerdict(null);
    try {
      const response = await fetch("/api/tiktok/verify-key", { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { notify(body.error || "Không kiểm tra được khoá TikTok.", true); return; }
      setVerdict(body);
      const map: Record<string, string> = {
        recognized: "TikTok nhận ra Client Key. Lỗi còn lại nằm ở chế độ ứng dụng, Target users hoặc Redirect URI.",
        not_recognized: "TikTok không nhận ra Client Key này — hãy chép lại đúng khoá ở tab Production hoặc Sandbox.",
        inconclusive: "TikTok trả lời chưa đủ để kết luận — hãy đối chiếu dấu vân tay khoá bên dưới với trang TikTok for Developers.",
        pair_not_recognized: "TikTok KHÔNG nhận ra cặp Client Key / Secret này. Đây chính là nguyên nhân gây lỗi “The request parameters are malformed” khi đổi token.",
        secret_mismatch: "Client Key đúng nhưng Client Secret không khớp cặp.",
        unsupported_grant: "TikTok không cho kiểm tra bằng cách này với ứng dụng của bạn; hãy đối chiếu thủ công.",
        not_configured: "Chưa có khoá trên máy chủ.",
        network: "Không gọi được TikTok từ máy chủ này.",
      };
      notify(map[body.verdict] || "Đã kiểm tra.", body.verdict !== "recognized");
    } catch { notify("Không kiểm tra được khoá TikTok.", true); }
    finally { setVerifying(false); }
  }

  async function disconnect() {
    setBusy(true);
    try {
      const response = await fetch("/api/tiktok/disconnect", { method: "POST" });
      const body = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!response.ok) throw new Error(body.error || "Không ngắt được kết nối.");
      notify(body.message || "Đã ngắt kết nối TikTok.");
      setConfirmOpen(false);
      await load();
    } catch (error) { notify(error instanceof Error ? error.message : "Không ngắt được kết nối.", true); }
    finally { setBusy(false); }
  }

  function togglePortalStep(key: string) {
    setPortalSteps((current) => {
      const next = { ...current, [key]: !current[key] };
      try { window.localStorage.setItem("tubeflow.tiktok.portalSteps", JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
  }

  const connected = !!status?.connected;
  const account = status?.account ?? null;
  const statusLabel = loading ? "Đang tải" : status?.reconnectRequired ? "Cần kết nối lại" : connected ? "Đã kết nối" : "Chưa kết nối";
  const statusClass = connected && !status?.reconnectRequired ? "status-green" : status?.reconnectRequired ? "status-amber" : "status-neutral";

  return (
    <div className="platform-connection-stack" id="tiktok-connection">
      <section className="channel-card card tiktok-connection-card">
        <div className="tiktok-app-icon" aria-hidden="true"><Music4 size={23} /></div>
        <div className="channel-main">
          <div className="channel-title">
            <h2>{account ? account.displayName || account.username || "Tài khoản TikTok" : "TikTok"}</h2>
            <span className={`status-pill ${statusClass}`}><span />{statusLabel}</span>
          </div>
          <p>
            {status?.reconnectRequired
              ? "Kết nối TikTok đã hết hạn (token truy cập chỉ có hiệu lực 24 giờ). Kết nối lại để tiếp tục đăng video."
              : connected && account
                ? `@${account.username || "—"} · ${formatNumber(account.followerCount)} người theo dõi · ${formatNumber(account.videoCount)} video · ${formatNumber(account.likesCount)} lượt thích.`
                : "Đăng video thẳng lên hồ sơ TikTok hoặc gửi vào hộp thư để hoàn tất trong ứng dụng, kèm kiểm tra Nguyên tắc cộng đồng."}
          </p>
          <div className="channel-features">
            <span><ShieldCheck size={14} />Token mã hoá, tự làm mới</span>
            <span><CheckCircle2 size={14} />{status?.canPublish ? "Có quyền đăng trực tiếp" : status?.canUpload ? "Chỉ quyền gửi hộp thư" : connected ? "Chưa có quyền đăng" : "Chưa kết nối"}</span>
          </div>
        </div>
        <div className="channel-actions">
          {connected ? (
            <>
              <a className="button button-primary" href="/api/tiktok/connect"><RefreshCw size={16} />{status?.reconnectRequired ? "Kết nối lại" : "Làm mới quyền"}</a>
              <button type="button" className="text-button muted" onClick={() => setConfirmOpen(true)} disabled={busy}><Unplug size={13} />Ngắt kết nối</button>
            </>
          ) : (
            <>
              <a className="button button-primary connect-button" href="/api/tiktok/connect"><Link2 size={17} />Kết nối TikTok</a>
              <span className="secure-caption"><LockKeyhole size={12} />Đăng nhập qua TikTok Login Kit</span>
            </>
          )}
        </div>
      </section>

      {connected && (
        <section className="card platform-pages-card" aria-label="Trạng thái quyền TikTok">
          <header className="platform-pages-head"><div><h3>Quyền & chế độ hiển thị</h3><p>TikTok cấp quyền theo phạm vi; chỉ phạm vi được cấp mới dùng được.</p></div>{busy && <Loader2 size={16} className="spin" />}</header>
          <ul className="platform-page-list">
            {(status?.grantedScopes.length ? status.grantedScopes : ["Chưa cấp quyền nào"]).map((scope) => {
              const label = scope === "video.publish" ? "Đăng trực tiếp lên hồ sơ" : scope === "video.upload" ? "Gửi vào hộp thư TikTok" : scope === "video.list" ? "Đọc danh sách video" : scope === "user.info.basic" ? "Đọc thông tin tài khoản" : scope;
              return (
                <li key={scope} className="is-active">
                  <span className="tiktok-scope-icon"><CheckCircle2 size={15} /></span>
                  <div><strong>{label}</strong><small>Phạm vi: <code>{scope}</code></small></div>
                  <span className="status-pill status-green"><span />Đã cấp</span>
                </li>
              );
            })}
            {status?.missingScopes.map((scope) => (
              <li key={`missing-${scope}`}>
                <span className="tiktok-scope-icon missing"><AlertTriangle size={15} /></span>
                <div><strong>{scope}</strong><small>Chưa cấp — cần cập nhật quyền trong TikTok for Developers</small></div>
                <span className="status-pill status-neutral"><span />Thiếu</span>
              </li>
            ))}
          </ul>
          {!status?.canPublish && <p className="platform-warning"><AlertTriangle size={14} />Không có quyền <code>video.publish</code>, nên chỉ gửi được video vào hộp thư TikTok để bạn tự đăng trong ứng dụng.</p>}
        </section>
      )}

      {status?.diagnostics && (!status.diagnostics.configured || status.diagnostics.warnings.length > 0) && (
        <section className="card platform-pages-card tiktok-diagnostics" aria-label="Chẩn đoán cấu hình TikTok">
          <header className="platform-pages-head"><div><h3>Chẩn đoán cấu hình TikTok</h3><p>TubeFlow kiểm tra khoá trước khi chuyển bạn sang TikTok, nên lỗi hiện ở đây thay vì một trang lỗi khó hiểu.</p></div><span className={`status-pill ${status.diagnostics.configured ? "status-amber" : "status-red"}`}><span />{status.diagnostics.configured ? "Cần lưu ý" : "Chưa dùng được"}</span></header>
          <ul className="platform-page-list">
            {status.diagnostics.problems.map((problem) => (
              <li key={problem}>
                <span className="tiktok-scope-icon missing"><AlertTriangle size={15} /></span>
                <div><strong>Chặn kết nối</strong><small>{problem}</small></div>
                <span className="status-pill status-red"><span />Lỗi</span>
              </li>
            ))}
            {status.diagnostics.warnings.map((warning) => (
              <li key={warning}>
                <span className="tiktok-scope-icon"><AlertTriangle size={15} /></span>
                <div><strong>Có thể gây lỗi client_key</strong><small>{warning}</small></div>
                <span className="status-pill status-amber"><span />Kiểm tra</span>
              </li>
            ))}
          </ul>
          {status.environment && (
            <div className={`tiktok-mode tiktok-mode-${status.environment.environment}`}>
              <div className="tiktok-mode-head">
                <span className="tiktok-mode-badge">{status.environment.label}</span>
                <strong>Chế độ ứng dụng TikTok đang dùng</strong>
                <code>{status.diagnostics?.keyPrefix ? `${status.diagnostics.keyPrefix}…` : "—"}</code>
              </div>
              <p>{status.environment.summary}</p>
              <ol className="tiktok-mode-steps">
                {status.environment.steps.map((step) => <li key={step}>{step}</li>)}
              </ol>
              {status.environment.caveats.length > 0 && (
                <ul className="tiktok-mode-caveats">
                  {status.environment.caveats.map((caveat) => <li key={caveat}><AlertTriangle size={12} />{caveat}</li>)}
                </ul>
              )}
              <p className="tiktok-mode-note">
                TubeFlow <b>không thể tự chuyển</b> tab Sandbox/Production trong trang TikTok — môi trường nằm ở chính cặp khoá. Muốn dùng Sandbox, hãy chép Client Key/Secret của tab Sandbox (thường bắt đầu bằng <code>sb</code>) vào <code>.env</code>.
              </p>
            </div>
          )}
          {status.diagnostics && (
            <div className="tiktok-golive">
              <p className="tiktok-golive-title">Tiến độ bật TikTok</p>
              <ol className="tiktok-golive-list">
                {([
                  { key: "credentials", label: "Có Client Key và Client Secret hợp lệ trên máy chủ", state: status.diagnostics.configured ? "done" : "todo", hint: status.diagnostics.configured ? null : "Xem mục “Chặn kết nối” bên dưới." },
                  { key: "verified", label: "Đã xác thực tên miền trong URL properties", state: portalSteps.verified ? "done" : "todo", manual: true, hint: "Bạn vừa làm bước này — tích vào đây để ghi nhận." },
                  { key: "sandbox", label: "Đã chọn chế độ Sandbox (nếu app chưa được duyệt)", state: portalSteps.sandbox ? "done" : status.diagnostics?.environment === "sandbox" ? "done" : "todo", manual: true, hint: status.diagnostics?.environment === "sandbox" ? "Khoá hiện tại là Sandbox." : "Gạt sang Sandbox, chép khoá tab Sandbox (sb…), thêm Target users." },
                  { key: "redirect", label: "Đã thêm Redirect URI dưới Login Kit → Web", state: portalSteps.redirect ? "done" : "todo", manual: true, hint: "Dán đúng URL trong khung bên dưới, có đuôi /api/tiktok/callback." },
                  { key: "scopes", label: "Đã thêm scope cần dùng", state: portalSteps.scopes ? "done" : "todo", manual: true, hint: "user.info.basic luôn có sẵn. Thêm video.publish, video.upload, video.list nếu muốn đăng video." },
                  { key: "appurl", label: "APP_URL khớp tên miền đã xác thực", state: status.diagnostics.appUrl === status.diagnostics.redirectUriToRegister.replace(/\/api\/tiktok\/callback$/, "") ? "done" : "todo", hint: status.diagnostics.appUrl },
                  { key: "connect", label: "Đăng nhập TikTok thành công", state: connected ? "done" : "todo", hint: connected ? (status.account?.displayName || status.account?.username || "Đã kết nối") : "Bấm Kết nối TikTok ở thẻ phía trên." },
                  { key: "publish", label: "Có quyền đăng trực tiếp (video.publish)", state: status.canPublish ? "done" : "todo", hint: status.canPublish ? null : "Chưa có thì chỉ gửi được video vào hộp thư TikTok." },
                ] as { key: string; label: string; state: string; manual?: boolean; hint?: string | null }[]).map((step) => {
                  const done = step.state === "done";
                  return (
                    <li key={step.key} className={done ? "done" : "todo"}>
                      {done ? <CheckCircle2 size={15} /> : <span className="tiktok-golive-dot" />}
                      <span className="tiktok-golive-copy">
                        <strong>{step.label}</strong>
                        {step.hint && !done && <small>{step.hint}</small>}
                      </span>
                      {step.manual && (
                        <button type="button" className="tiktok-golive-toggle" aria-pressed={done} onClick={() => togglePortalStep(step.key)}>
                          {done ? "Bỏ đánh dấu" : "Đã làm"}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ol>
              <p className="tiktok-golive-note">Các ô có nút “Đã làm” do TikTok quản lý nên TubeFlow không tự kiểm tra được; chúng được ghi nhớ trên trình duyệt này.</p>
            </div>
          )}
          <dl className="tiktok-key-facts">
            <div><dt>Client Key</dt><dd>{status.diagnostics.clientKey.present ? `${status.diagnostics.clientKey.length} ký tự · ${status.diagnostics.clientKey.kind}` : "chưa có"}</dd></div>
            <div><dt>Client Secret</dt><dd>{status.diagnostics.clientSecret.present ? `${status.diagnostics.clientSecret.length} ký tự` : "chưa có"}</dd></div>
            <div><dt>Redirect URI</dt><dd><code>{status.diagnostics.redirectUri}</code></dd></div>
          </dl>
          <div className="tiktok-redirect-box">
            <div className="tiktok-redirect-head">
              <strong>Dán CHÍNH XÁC dòng này vào TikTok → Login Kit → Redirect URI (Web)</strong>
            </div>
            <div className="tiktok-redirect-value">
              <code>{status.diagnostics.redirectUriToRegister}</code>
              <CopyButton text={status.diagnostics.redirectUriToRegister} label="Sao chép Redirect URI cho TikTok" compact />
            </div>
            <ul className="tiktok-redirect-rules">
              <li><b>Phải có đuôi <code>/api/tiktok/callback</code>.</b> Nếu bạn chỉ dán tên miền gốc (ví dụ <code>https://…trycloudflare.com/</code>), TikTok sẽ từ chối vì không khớp đường dẫn TubeFlow gửi đi.</li>
              <li>Đúng cả giao thức (<code>https://</code>), không thêm <code>/</code> ở cuối, không thêm khoảng trắng.</li>
              <li>Ô đó phải nằm dưới nhãn <b>Web</b> — không phải Desktop/Android/iOS.</li>
              <li>Giá trị trong <code>APP_URL</code> của <code>.env</code> phải đúng bằng phần gốc của URI này: <code>{status.diagnostics.appUrl}</code>.</li>
            </ul>
            <div className="tiktok-ownership">
              <strong><ShieldCheck size={15} />TikTok bắt xác thực quyền sở hữu tên miền</strong>
              <p>Ở chế độ <b>Production</b>, TikTok chỉ cho thêm Redirect URI sau khi bạn xác thực tên miền trong <b>URL properties</b>. Tên miền bạn không sở hữu — như <code>*.trycloudflare.com</code> — <b>không thể</b> xác thực bằng DNS hay tệp.</p>
              <p className="tiktok-ownership-title">Ba cách đi tiếp:</p>
              <ol>
                <li><b>Nhanh nhất để thử đăng nhập:</b> tạo <b>Sandbox</b> của ứng dụng và dùng Client Key/Secret của Sandbox. Với Sandbox, TikTok <b>không</b> bắt xác thực URL cho Login Kit (chỉ Content Posting API mới cần). Nhớ thêm tài khoản TikTok của bạn vào <b>Target users</b>.</li>
                <li><b>Đúng cho chạy thật:</b> dùng một tên miền bạn sở hữu (mua ~100–200 nghìn đồng/năm), trỏ vào tunnel bằng <b>Cloudflare Named Tunnel</b>, rồi xác thực tên miền trong TikTok bằng bản ghi <b>DNS TXT</b> (khuyến nghị) hoặc tệp xác thực. Sau đó đặt <code>APP_URL</code> là tên miền đó.</li>
                <li><b>Nếu DNS không sửa được:</b> xác thực bằng <b>URL prefix</b> + tệp xác thực. Dán nội dung tệp TikTok cấp vào <code>TIKTOK_SITE_VERIFICATION</code> trong <code>.env</code>; TubeFlow sẽ tự phục vụ tệp tại đường dẫn bên dưới.</li>
              </ol>
              {status.diagnostics.verificationFileUrl ? (
                <div className="tiktok-verify-urls">
                  <div className="tiktok-verify-url">
                    <span className="tiktok-verify-url-label">1. URL prefix cần nhập vào ô “URL prefix” của TikTok</span>
                    <div className="tiktok-verify-url-value"><code>{status.diagnostics.verificationBackstopUrl ? `https://${status.diagnostics.hostname}/` : ""}</code><CopyButton text={`https://${status.diagnostics.hostname}/`} label="Sao chép URL prefix" compact /></div>
                  </div>
                  <div className="tiktok-verify-url">
                    <span className="tiktok-verify-url-label">2. Tệp TikTok sẽ tự tải để kiểm tra (TubeFlow đang phục vụ)</span>
                    <div className="tiktok-verify-url-value"><code>{status.diagnostics.verificationFileUrl}</code><CopyButton text={status.diagnostics.verificationFileUrl} label="Sao chép URL tệp xác thực" compact /></div>
                  </div>
                  <p className="tiktok-ownership-note">Tên tệp chứa chính chữ ký (<code>{status.diagnostics.verificationFileName}</code>) — đây là đường dẫn TikTok thật sự tải. TubeFlow tự chuyển mọi tệp <code>tiktok*.txt</code> ở gốc tên miền về cùng một nội dung, nên bạn không cần tạo tệp.</p>
                  <a className="tiktok-verify-test" href={status.diagnostics.verificationFileUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} />Mở thử tệp xác thực</a>
                </div>
              ) : (
                <div className="tiktok-ownership-steps">
                  <p className="tiktok-ownership-note">Chưa bật tệp xác thực. Làm đúng 4 bước:</p>
                  <ol>
                    <li>TikTok → <b>URL properties</b> → <b>Verify properties</b> → chọn <b>URL prefix</b>.</li>
                    <li>Nhập <code>https://{status.diagnostics.hostname}/</code> (có <code>https://</code> và dấu <code>/</code> ở cuối).</li>
                    <li>TikTok hiện một <b>chữ ký</b>. Thêm vào <code>.env</code>:<br /><code>TIKTOK_SITE_VERIFICATION=tiktok-developers-site-verification=&lt;chữ ký&gt;</code></li>
                    <li>Khởi động lại máy chủ, rồi bấm <b>Verify</b> trong TikTok. Nếu TikTok chỉ cho tải tệp về, bạn có thể dán riêng phần chữ ký vào biến này — TubeFlow tự ghép đúng nội dung.</li>
                  </ol>
                </div>
              )}
              {status.diagnostics.redirectOverridden && (
                <p className="tiktok-ownership-note"><CheckCircle2 size={13} />Đang dùng <code>TIKTOK_REDIRECT_URI</code> để trỏ callback về tên miền đã xác thực.</p>
              )}
            </div>
            {status.diagnostics.quickTunnel && (
              <div className="tiktok-redirect-warn">
                <AlertTriangle size={14} />
                <p>Đây là <b>Cloudflare Quick Tunnel</b>: tên miền thay đổi mỗi lần chạy lại <code>cloudflared</code>. Mỗi lần đổi, bạn phải sửa cả <code>APP_URL</code> và Redirect URI trong TikTok. Khi thử nhiều lần, nên dùng <b>Named Tunnel</b> để có tên miền cố định.</p>
              </div>
            )}
          </div>
          {status.request && (
            <div className="tiktok-request">
              <p className="tiktok-request-title">Yêu cầu đăng nhập TubeFlow gửi tới TikTok</p>
              <dl className="tiktok-request-grid">
                <div><dt>client_key</dt><dd><code>{status.request.clientKeyMasked}</code></dd></div>
                <div><dt>scope</dt><dd><code>{status.request.scopes.join(",") || "(trống)"}</code></dd></div>
                <div><dt>redirect_uri</dt><dd><code>{status.request.redirectUri}</code></dd></div>
                <div><dt>response_type</dt><dd><code>{status.request.responseType}</code></dd></div>
              </dl>
              <p className="tiktok-request-note">
                Đối chiếu với TikTok for Developers → ứng dụng → <b>Login Kit</b>. Lỗi <code>client_key</code> nghĩa là TikTok không nhận giá trị khoá; lỗi <code>redirect_uri</code> (<code>errCode 10006</code>) là do URI chưa khớp.
              </p>
            </div>
          )}
          <div className="tiktok-target-users">
            <strong><AlertTriangle size={15} />Điều kiện để chính tài khoản của bạn đăng nhập được</strong>
            <ul>
              <li>Tài khoản TikTok dùng để đăng nhập phải nằm trong <b>Target users</b> nếu bạn đang dùng ứng dụng ở chế độ <b>Sandbox</b>. Thêm bằng cách bấm <b>Add account</b> rồi đăng nhập chính tài khoản đó (số điện thoại hay email đều được — quan trọng là đúng tài khoản).</li>
              <li>Tài khoản developer (email) và tài khoản TikTok (số điện thoại) là <b>hai danh tính riêng</b>; chúng không cần trùng email. Chỉ cần thêm tài khoản TikTok vào Target users.</li>
              <li>Nếu đang dùng <b>khoá Production</b> khi ứng dụng <b>chưa được TikTok duyệt</b>, trang đăng nhập sẽ báo đúng lỗi <code>client_key</code> / <code>unauthorized_client</code>. Hãy chuyển sang khoá <b>Sandbox</b> và khai Redirect URI trong tab Sandbox.</li>
              <li>Mỗi scope ngoài <code>user.info.basic</code> phải được thêm trong mục <b>Scopes</b> của ứng dụng, nếu không yêu cầu uỷ quyền có thể thất bại.</li>
            </ul>
            {status.extraScopes?.length ? (
              <p className="tiktok-request-note">TubeFlow đang yêu cầu thêm: <code>{status.extraScopes.join(",")}</code>. Nếu đăng nhập lỗi, hãy thử thu hẹp còn <code>user.info.basic</code> bằng biến môi trường, rồi thêm lại sau khi TikTok duyệt.</p>
            ) : (
              <p className="tiktok-request-note">TubeFlow chỉ yêu cầu <code>user.info.basic</code>. Muốn đăng video, thêm dòng dưới vào <code>.env</code> sau khi ứng dụng đã được cấp các scope đó: <code>TIKTOK_SCOPES=user.info.basic,video.list,video.publish,video.upload</code></p>
            )}
          </div>
          <div className="tiktok-verify">
            <div className="tiktok-verify-head">
              <div>
                <strong><KeyRound size={15} />Kiểm chứng cặp Client Key / Secret với chính TikTok</strong>
                <p>TubeFlow gọi TikTok một lần để xem TikTok có nhận ra cặp khoá hay không. Đây là bước phân biệt then chốt: lỗi “The request parameters are malformed” khi đổi token thường xuất hiện khi cặp khoá không khớp.</p>
              </div>
              <button type="button" className="fb-button primary" onClick={() => void verifyKey()} disabled={verifying}>
                {verifying ? <Loader2 size={14} className="spin" /> : <ShieldCheck size={14} />}Kiểm tra khoá
              </button>
            </div>
            {status.diagnostics.clientKeyFingerprint && (
              <p className="tiktok-fingerprint">Dấu vân tay khoá trên máy chủ: <code>{status.diagnostics.clientKeyFingerprint.masked}</code> · {status.diagnostics.clientKeyFingerprint.length} ký tự · SHA-256 <code>{status.diagnostics.clientKeyFingerprint.sha256Prefix}</code></p>
            )}
            {verdict && (
              <div className="tiktok-pair">
                <span className="tiktok-pair-title">Cặp khoá máy chủ đang dùng</span>
                <dl className="tiktok-pair-grid">
                  <div><dt>Client Key</dt><dd><code>{verdict.fingerprint?.masked ?? "—"}</code> · {verdict.fingerprint?.length ?? 0} ký tự</dd></div>
                  <div><dt>Client Secret</dt><dd><code>{verdict.secretFingerprint?.masked ?? "—"}</code> · {verdict.secretFingerprint?.length ?? 0} ký tự</dd></div>
                  <div><dt>Môi trường khoá</dt><dd>{verdict.environment ?? "—"}</dd></div>
                  <div><dt>redirect_uri gửi đi</dt><dd><code>{verdict.redirectUri ?? "—"}</code></dd></div>
                  <div className="wide"><dt>scope gửi đi</dt><dd><code>{verdict.scopes?.join(",") || "—"}</code></dd></div>
                </dl>
                <p className="tiktok-pair-note">So 4 ký tự đầu/cuối của Client Key và Secret với trang TikTok for Developers. Hai giá trị phải được chép từ <b>cùng một tab</b> (Sandbox hoặc Production).</p>
              </div>
            )}
            {verdict && (
              <div className={`tiktok-verdict ${verdict.verdict === "recognized" ? "ok" : "bad"}`} role="status">
                <strong>{verdict.verdict === "recognized" ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}{
                  verdict.verdict === "recognized" ? "TikTok nhận ra Client Key này"
                  : verdict.verdict === "pair_not_recognized" ? "TikTok không nhận ra CẶP khoá này"
                  : verdict.verdict === "inconclusive" ? "Chưa kết luận được từ phản hồi của TikTok"
                  : verdict.verdict === "not_recognized" ? "TikTok KHÔNG nhận ra Client Key này"
                  : verdict.verdict === "secret_mismatch" ? "Client Secret không khớp với Client Key"
                  : verdict.verdict === "unsupported_grant" ? "Không kiểm tra được bằng cách này"
                  : verdict.verdict === "not_configured" ? "Thiếu khoá trên máy chủ"
                  : "Không gọi được TikTok"
                }</strong>
                <span>{verdict.verdict === "recognized"
                  ? "Khoá hợp lệ. Nếu trang đăng nhập vẫn báo client_key, nguyên nhân là chế độ ứng dụng (Development/Sandbox) chưa thêm tài khoản của bạn vào Target users, hoặc Redirect URI chưa khớp tuyệt đối."
                  : verdict.verdict === "not_recognized"
                    ? "Giá trị trong TIKTOK_CLIENT_KEY không phải khoá mà TikTok biết. Thường gặp: lấy khoá Sandbox nhưng khai Redirect URI ở Production (hoặc ngược lại), chép App ID thay vì Client Key, hoặc khoá bị cắt khi dán."
                    : verdict.verdict === "pair_not_recognized"
                      ? "Định dạng khoá hợp lệ nhưng TikTok không nhận ra cặp này. Nguyên nhân phổ biến nhất: bạn đã tạo lại Client Secret trong TikTok for Developers nhưng .env vẫn giữ secret cũ; hoặc Client Key lấy ở tab Sandbox còn Secret lấy ở tab Production (hay ngược lại). Hãy chép lại CẢ HAI giá trị từ cùng một tab, lưu .env, khởi động lại rồi kiểm tra lại."
                    : verdict.verdict === "inconclusive"
                      ? "TikTok trả lời “invalid_request / malformed”. Với TikTok, thông điệp này xuất hiện ở hai trường hợp: cặp khoá không đúng (ví dụ khoá Sandbox ghép với secret Production, hoặc secret bị cắt khi dán), hoặc ứng dụng chưa bật luồng kiểm tra. Hãy so khớp dấu vân tay bên dưới trước. Phản hồi này xuất hiện khi khoá không tồn tại, và cũng xuất hiện khi ứng dụng chưa bật luồng kiểm tra client_credentials — nên chưa thể kết luận. Hãy so 4 ký tự đầu và 4 ký tự cuối của dấu vân tay bên dưới với trang TikTok for Developers → ứng dụng → Basic information."
                    : verdict.verdict === "secret_mismatch"
                      ? "Hãy chép lại cả cặp Client Key và Client Secret từ cùng một tab trong TikTok for Developers."
                      : verdict.verdict === "unsupported_grant"
                        ? "Ứng dụng chưa bật luồng client_credentials. Hãy đối chiếu thủ công: khoá 4 ký tự đầu/cuối phải trùng với trang TikTok."
                        : "Kiểm tra kết nối mạng của máy chủ rồi thử lại."}</span>
                {(verdict.providerError || verdict.providerMessage) && (
                  <span className="tiktok-verdict-provider">TikTok trả về: <code>{verdict.providerError ?? "—"}</code>{verdict.providerMessage ? ` · ${verdict.providerMessage}` : ""}</span>
                )}
                <span className="tiktok-verdict-time">Kiểm tra lúc {new Date(verdict.checkedAt).toLocaleString("vi-VN")} · mỗi lần bấm là một yêu cầu mới</span>
              </div>
            )}
          </div>
          <ol className="tiktok-fix-steps">
            <li>Mở TikTok for Developers → ứng dụng của bạn → <b>Login Kit</b>. Chép <b>Client Key</b> ở đúng tab bạn dùng: <b>Production</b> hoặc <b>Sandbox</b> — hai tab có khoá khác nhau.</li>
            <li>Dán vào <code>.env</code> dạng <code>TIKTOK_CLIENT_KEY=...</code>, không thêm dấu nháy, không xuống dòng giữa chừng. Nếu có <code>.env.local</code>, biến ở đó sẽ <b>ghi đè</b> <code>.env</code>.</li>
            <li>Client Key không phải App ID và cũng không phải Client Secret. Khoá sandbox chỉ cho tài khoản thử nghiệm đã khai báo đăng nhập được.</li>
            <li>Khởi động lại máy chủ sau khi sửa, rồi bấm Kết nối TikTok. Nếu TikTok vẫn báo lỗi, hãy <b>đóng tab TikTok cũ và bấm Kết nối lại</b>: nếu mã log giống y hệt lần trước, trình duyệt chỉ đang mở lại trang cũ chứ chưa gửi yêu cầu mới. Gửi mã log mới cho bộ phận hỗ trợ TikTok kèm thời điểm bạn thử.</li>
          </ol>
        </section>
      )}

      {lastFailure && (
        <section className="card platform-pages-card tiktok-last-failure" role="alert">
          <header className="platform-pages-head">
            <div><h3>Lần kết nối gần nhất thất bại</h3><p>Thông điệp do TikTok hoặc máy chủ trả về, giữ lại để bạn đối chiếu.</p></div>
            <button type="button" className="fb-icon-button" aria-label="Ẩn thông báo lỗi" onClick={() => setLastFailure(null)}><X size={14} /></button>
          </header>
          <p className="tiktok-last-failure-text"><code>{lastFailure}</code></p>
          <ul className="tiktok-fix-steps">
            <li><b>Nếu là “request parameters are malformed” ở bước đổi token:</b> đây là lỗi cặp khoá, không phải mã uỷ quyền. Bấm <b>Kiểm chứng cặp Client Key / Secret</b> bên dưới. Kết quả <code>pair_not_recognized</code> nghĩa là TikTok không biết cặp này — hãy chép lại <b>cả hai</b> giá trị từ cùng một tab và cập nhật <code>.env</code>, rồi khởi động lại máy chủ.</li>
            <li><b>Kiểm tra secret có bị cũ:</b> nếu bạn đã bấm Regenerate Client Secret trong TikTok, secret trong <code>.env</code> mất hiệu lực ngay. So 4 ký tự cuối của secret hiển thị trong app với trang TikTok for Developers.</li>
            <li><b>Kiểm tra trộn tab:</b> Client Key <code>sb…</code> phải đi với secret của Sandbox; <code>aw…</code> với Production.</li>
            <li><b>Nếu là mã uỷ quyền hết hạn/đã dùng:</b> mã chỉ dùng một lần, sống vài phút. Đóng tab TikTok cũ rồi bấm Kết nối TikTok lại.</li>
            <li><b>Nếu không đọc được thông tin tài khoản:</b> ứng dụng thiếu scope <code>user.info.basic</code>.</li>
          </ul>
        </section>
      )}

      <details className="card platform-setup-card">
        <summary>Thiết lập ứng dụng TikTok (làm một lần)</summary>
        <ol>
          <li>Đăng ký tại <b>TikTok for Developers</b>, tạo ứng dụng và thêm sản phẩm <b>Login Kit</b> cùng <b>Content Posting API</b>.</li>
          <li>Trong phần Quyền (Scopes), bật <code>user.info.basic</code>, <code>video.publish</code>, <code>video.upload</code> và <code>video.list</code>.</li>
          <li>Lấy <b>Client Key</b> và <b>Client Secret</b> đặt vào <code>.env</code> dưới tên TIKTOK_CLIENT_KEY và TIKTOK_CLIENT_SECRET.</li>
          <li>Thêm đúng URI sau vào Redirect URI của ứng dụng:
            <div className="platform-copy-row"><code>{status?.redirectUri || "APP_URL/api/tiktok/callback"}</code>{status?.redirectUri && <CopyButton text={status.redirectUri} compact label="Sao chép URI chuyển hướng TikTok" />}</div>
          </li>
          <li><b>Quan trọng:</b> ứng dụng chưa qua kiểm duyệt của TikTok sẽ bị ép đăng ở chế độ <b>Chỉ mình tôi</b>. Để đăng công khai, gửi ứng dụng qua quy trình kiểm duyệt của TikTok.</li>
        </ol>
        {status && !status.configured && <p className="platform-warning"><X size={14} />Máy chủ chưa có TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET hợp lệ. Thêm vào .env rồi khởi động lại.</p>}
      </details>

      <Modal open={confirmOpen} onClose={() => !busy && setConfirmOpen(false)} title="Ngắt kết nối TikTok?" description="Bạn có thể kết nối lại bất cứ lúc nào.">
        <div className="disconnect-info"><Unplug size={26} /><p>TubeFlow sẽ xoá token TikTok đã lưu. <strong>Video đã đăng trên TikTok và bản nháp trong TubeFlow vẫn được giữ.</strong></p></div>
        <div className="modal-actions">
          <button className="button button-secondary" onClick={() => setConfirmOpen(false)} disabled={busy}>Giữ kết nối</button>
          <button className="button button-danger" onClick={() => void disconnect()} disabled={busy}>{busy && <Loader2 size={15} className="spin" />}Ngắt kết nối</button>
        </div>
      </Modal>
    </div>
  );
}
