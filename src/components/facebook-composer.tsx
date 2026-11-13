"use client";

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, Clapperboard, Copy, Film, Image as ImageIcon, Loader2, Lightbulb, Send, ShieldCheck, Sparkles, Upload, X, Play } from "lucide-react";
import { FB_KINDS, FB_KIND_LABELS, FB_LIMITS, analyzeFacebook, buildFacebookAssistant, scheduleProblem, type FbKind } from "@/lib/facebook-policy";
import type { FbStatus } from "@/lib/facebook-types";
import type { View } from "@/lib/types";

type Media = { file: File; url: string; width: number | null; height: number | null; seconds: number | null };
export interface ComposerPrefill { message: string; kind?: FbKind; sourceLabel: string }

const KIND_HELP: Record<FbKind, string> = {
  text: "Bài văn bản, không cần tệp. Có thể lưu nháp.",
  photo: "Ảnh JPG hoặc PNG. Có thể hẹn giờ đăng.",
  video: "Video MP4 hoặc MOV. Có thể hẹn giờ đăng.",
  reel: "Video dọc 9:16, 3–90 giây. Nên xuất 1080x1920.",
};

function readMedia(file: File, kind: FbKind): Promise<Media> {
  const url = URL.createObjectURL(file);
  if (kind === "photo") {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ file, url, width: image.naturalWidth, height: image.naturalHeight, seconds: null });
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Không đọc được ảnh.")); };
      image.src = url;
    });
  }
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => resolve({ file, url, width: video.videoWidth || null, height: video.videoHeight || null, seconds: Number.isFinite(video.duration) ? video.duration : null });
    video.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Không đọc được video. Thử định dạng MP4 hoặc MOV.")); };
    video.src = url;
  });
}

export function FacebookComposer({ status, prefill, onPosted, onNavigate, notify }: {
  status: FbStatus;
  prefill: ComposerPrefill | null;
  onPosted: () => void;
  onNavigate: (view: View, route?: { tab?: string; videoId?: string; planId?: string }) => void;
  notify: (message: string, error?: boolean) => void;
}) {
  const pageName = status.pages.find((page) => page.id === status.activePageId)?.name || "Trang Facebook";
  const [kind, setKind] = useState<FbKind>(prefill?.kind ?? "text");
  const [message, setMessage] = useState(prefill?.message ?? "");
  const [media, setMedia] = useState<Media | null>(null);
  const [mode, setMode] = useState<"publish" | "schedule" | "draft">("publish");
  const [scheduledAt, setScheduledAt] = useState("");
  const [brandedAttested, setBrandedAttested] = useState(false);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [blockedFindings, setBlockedFindings] = useState<{ id: string; message: string; fix: string }[]>([]);
  const [transfer, setTransfer] = useState<string | null>(null);
  const [sourceLabel] = useState(prefill?.sourceLabel ?? "");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const scheduleDate = scheduledAt ? new Date(scheduledAt) : null;
  const effectiveMode = kind !== "text" && mode === "draft" ? "publish" : mode;
  const report = useMemo(() => analyzeFacebook({
    kind,
    message,
    hasMedia: kind === "text" || !!media,
    width: media?.width ?? null,
    height: media?.height ?? null,
    seconds: media?.seconds ?? null,
    bytes: media?.file.size ?? null,
    scheduledAt: effectiveMode === "schedule" ? scheduleDate : null,
    brandedAttested,
  }), [kind, message, media, effectiveMode, scheduleDate, brandedAttested]);
  const assistant = useMemo(() => buildFacebookAssistant({
    kind, message, hasMedia: !!media, width: media?.width ?? null, height: media?.height ?? null,
    seconds: media?.seconds ?? null, bytes: null, scheduledAt: null, brandedAttested,
  }, report, pageName), [kind, message, media, report, pageName, brandedAttested]);
  const timingError = effectiveMode === "schedule" ? scheduleProblem(scheduleDate) : null;
  const previewText = message.slice(0, FB_LIMITS.hookChars);
  const canSubmit = !submitting && (effectiveMode === "draft" ? message.trim().length > 0 : report.readyToPublish) && (effectiveMode !== "schedule" || (!!scheduledAt && !timingError));

  function changeKind(next: FbKind) {
    setKind(next);
    setBlockedFindings([]);
    if (next === "text") setMedia(null);
    if (media && next === "photo" && media.file.type && !media.file.type.startsWith("image/")) setMedia(null);
    if (media && (next === "video" || next === "reel") && !media.file.type.startsWith("video/")) setMedia(null);
  }

  async function pickFile(file: File | undefined) {
    if (!file) return;
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    if (kind === "photo" && !isImage) { notify("Loại Ảnh cần tệp JPG hoặc PNG.", true); return; }
    if ((kind === "video" || kind === "reel") && !isVideo) { notify("Loại Video/Reels cần tệp MP4 hoặc MOV.", true); return; }
    if (file.size > FB_LIMITS.mediaBytes) { notify("Tệp vượt 1GB, hãy nén lại trước khi đăng.", true); return; }
    try {
      const next = await readMedia(file, kind);
      if (media) URL.revokeObjectURL(media.url);
      setMedia(next);
      setBlockedFindings([]);
    } catch (error) { notify(error instanceof Error ? error.message : "Không đọc được tệp", true); }
  }

  async function submit() {
    if (effectiveMode !== "draft" && !report.readyToPublish) {
      notify(`Còn ${report.blockers.length} lỗi chặn. Hãy sửa trước khi đăng.`, true);
      return;
    }
    setSubmitting(true);
    setBlockedFindings([]);
    try {
      const form = new FormData();
      form.set("mode", effectiveMode);
      form.set("kind", kind);
      form.set("message", message);
      form.set("notes", notes);
      form.set("brandedAttested", brandedAttested ? "1" : "0");
      if (media) {
        form.set("file", media.file, media.file.name);
        if (media.width) form.set("width", String(media.width));
        if (media.height) form.set("height", String(media.height));
        if (media.seconds) form.set("seconds", String(media.seconds));
      }
      if (effectiveMode === "schedule" && scheduleDate) form.set("scheduledAt", scheduleDate.toISOString());
      const response = await fetch("/api/facebook/posts", { method: "POST", body: form });
      const data = await response.json().catch(() => ({})) as { error?: string; findings?: { id: string; message: string; fix?: string }[] };
      if (response.status === 422 && data.findings) {
        setBlockedFindings(data.findings.map((item) => ({ id: item.id, message: item.message, fix: item.fix ?? "" })));
        notify(data.error || "Nội dung còn lỗi chặn.", true);
        return;
      }
      if (!response.ok) { notify(data.error || "Không đăng được bài viết.", true); return; }
      notify(effectiveMode === "draft" ? "Đã lưu bản nháp." : effectiveMode === "schedule" ? "Đã lên lịch trên Facebook." : "Đã đăng lên Trang Facebook.");
      setMessage(""); setMedia(null); setScheduledAt(""); setNotes(""); setBrandedAttested(false);
      onPosted();
    } catch { notify("Mất kết nối khi gửi. Nội dung của bạn vẫn còn trong form, hãy thử lại.", true); }
    finally { setSubmitting(false); }
  }

  async function sendToYouTube() {
    if (!message.trim()) { notify("Viết nội dung trước khi chuyển sang YouTube.", true); return; }
    setTransfer("loading");
    try {
      const response = await fetch("/api/facebook/adapt", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, kind, pageName }),
      });
      const data = await response.json().catch(() => ({})) as { planId?: string; error?: string };
      if (!response.ok || !data.planId) throw new Error(data.error || "Không chuyển được nội dung.");
      notify("Đã chuẩn bị tiêu đề, mô tả và tag cho YouTube. Mở phần đăng video…");
      onNavigate("studio", { tab: "upload", planId: data.planId });
    } catch (error) { notify(error instanceof Error ? error.message : "Không chuyển được nội dung", true); }
    finally { setTransfer(null); }
  }

  function insert(text: string, replace = false) {
    setMessage((current) => (replace || !current.trim() ? text : `${current.trimEnd()}\n\n${text}`).slice(0, FB_LIMITS.textMax));
  }

  return (
    <div className="fb-composer">
      <section className="fb-card fb-compose-main">
        <header className="fb-card-head">
          <div><h2>Soạn nội dung</h2><p>Đăng vào <strong>{pageName}</strong>. Chính sách được kiểm tra trước khi gửi.</p></div>
          {sourceLabel && <span className="fb-source-chip"><Play size={14} />{sourceLabel}</span>}
        </header>

        <div className="fb-kind-grid" role="radiogroup" aria-label="Loại nội dung">
          {FB_KINDS.map((item) => {
            const Icon = item === "reel" ? Film : item === "photo" ? ImageIcon : item === "video" ? Clapperboard : Lightbulb;
            return (
              <button key={item} type="button" role="radio" aria-checked={kind === item} className={`fb-kind ${kind === item ? "is-active" : ""}`} onClick={() => changeKind(item)}>
                <Icon size={18} /><strong>{FB_KIND_LABELS[item]}</strong><small>{KIND_HELP[item]}</small>
              </button>
            );
          })}
        </div>

        {kind !== "text" && (
          <div className="fb-media-zone">
            <input ref={fileRef} type="file" hidden accept={kind === "photo" ? "image/*" : "video/*"} onChange={(event) => { void pickFile(event.target.files?.[0]); event.target.value = ""; }} />
            {media ? (
              <div className="fb-media-preview">
                {kind === "photo" ? <img src={media.url} alt="" /> : <video src={media.url} controls playsInline muted />}
                <div>
                  <strong>{media.file.name}</strong>
                  <small>{media.width && media.height ? `${media.width}×${media.height}` : "Không đọc được kích thước"}{media.seconds ? ` · ${Math.round(media.seconds)} giây` : ""} · {(media.file.size / 1024 / 1024).toFixed(1)} MB</small>
                  <button type="button" className="fb-link-button" onClick={() => { URL.revokeObjectURL(media.url); setMedia(null); }}><X size={13} />Bỏ tệp này</button>
                </div>
              </div>
            ) : (
              <button type="button" className="fb-dropzone" onClick={() => fileRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void pickFile(event.dataTransfer.files[0]); }}>
                <Upload size={22} /><strong>Chọn {kind === "photo" ? "ảnh" : "video"} hoặc kéo thả vào đây</strong><small>{kind === "reel" ? "Lý tưởng: 1080×1920, 9:16, từ 3 đến 90 giây" : "Tối đa 1GB"}</small>
              </button>
            )}
          </div>
        )}

        <label className="fb-field">
          <span>Nội dung {kind === "text" ? "bài viết" : "đi kèm"} <em>{message.length}/{FB_LIMITS.textMax}</em></span>
          <textarea rows={7} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Chia sẻ điều bạn đang nghĩ, một kinh nghiệm hay một câu chuyện ngắn…" />
        </label>

        <div className="fb-preview">
          <span className="fb-preview-label">Hiển thị trên dòng thời gian (125 ký tự đầu)</span>
          <p>{previewText || <em>Nội dung sẽ hiện ở đây.</em>}{message.length > FB_LIMITS.hookChars && <span className="fb-muted"> …</span>}</p>
        </div>

        <div className="fb-schedule-row">
          <div className="fb-segment" role="group" aria-label="Cách đăng">
            <button type="button" aria-pressed={mode === "publish"} className={mode === "publish" ? "is-active" : ""} onClick={() => setMode("publish")}><Send size={14} />Đăng ngay</button>
            <button type="button" aria-pressed={mode === "schedule"} className={mode === "schedule" ? "is-active" : ""} onClick={() => setMode("schedule")}><CalendarClock size={14} />Lên lịch</button>
            <button type="button" aria-pressed={mode === "draft"} disabled={kind !== "text"} className={mode === "draft" ? "is-active" : ""} onClick={() => setMode("draft")} title={kind !== "text" ? "Bản nháp chỉ dành cho bài văn bản" : undefined}><Copy size={14} />Lưu nháp</button>
          </div>
          {mode === "schedule" && (
            <label className="fb-field fb-field-inline">
              <span>Thời gian đăng</span>
              <input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} />
              {timingError && <small className="fb-error-text">{timingError}</small>}
            </label>
          )}
        </div>

        <label className="fb-attest">
          <input type="checkbox" checked={brandedAttested} onChange={(event) => setBrandedAttested(event.target.checked)} />
          <span>Tôi đã bật <strong>Nội dung có thương hiệu</strong> trong Meta nếu bài có hợp tác, tài trợ hoặc quảng cáo.</span>
        </label>
        <label className="fb-field">
          <span>Ghi chú nội bộ (không đăng lên Facebook)</span>
          <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="VD: chờ phản hồi từ đối tác, đăng sau khi duyệt logo…" maxLength={300} />
        </label>

        {blockedFindings.length > 0 && (
          <div className="fb-blocked" role="alert">
            <strong><AlertTriangle size={16} />Facebook sẽ không nhận nội dung này</strong>
            <ul>{blockedFindings.map((item) => <li key={item.id}>{item.message}{item.fix && <em> → {item.fix}</em>}</li>)}</ul>
          </div>
        )}

        <footer className="fb-submit-bar">
          <span className={`fb-readiness ${report.readyToPublish ? "ok" : "bad"}`}>
            {report.readyToPublish ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
            {report.readyToPublish ? "Sẵn sàng" : `${report.blockers.length} lỗi chặn`} · {report.score}/100 ({report.grade})
          </span>
          <button type="button" className="fb-button primary" disabled={!canSubmit} onClick={() => void submit()}>
            {submitting ? <Loader2 size={15} className="spin" /> : effectiveMode === "draft" ? <Copy size={15} /> : effectiveMode === "schedule" ? <CalendarClock size={15} /> : <Send size={15} />}
            {effectiveMode === "draft" ? "Lưu nháp" : effectiveMode === "schedule" ? "Lên lịch trên Facebook" : "Đăng ngay"}
          </button>
        </footer>
      </section>

      <aside className="fb-compose-side">
        <section className="fb-card">
          <header className="fb-card-head compact"><div><h3><ShieldCheck size={16} />Kiểm tra chính sách</h3><p>{report.findings.length ? `${report.findings.length} gợi ý` : "Không có cảnh báo"}</p></div></header>
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
          <header className="fb-card-head compact"><div><h3><Sparkles size={16} />Trợ lý nội dung</h3><p>Gợi ý theo luật, không tự đăng</p></div></header>
          <div className="fb-assist-block">
            <span className="fb-assist-title">Mở đầu (hook)</span>
            {assistant.hooks.map((hook) => <button key={hook} type="button" className="fb-chip-button" onClick={() => insert(hook, !message.trim())}>{hook}</button>)}
          </div>
          <div className="fb-assist-block">
            <span className="fb-assist-title">Lời kêu gọi an toàn</span>
            {assistant.ctas.map((cta) => <button key={cta} type="button" className="fb-chip-button" onClick={() => insert(cta)}>{cta}</button>)}
          </div>
          <div className="fb-assist-block">
            <span className="fb-assist-title">Hashtag gợi ý (tối đa 3)</span>
            <div className="fb-tags">{assistant.hashtags.map((tag) => <button key={tag} type="button" className="fb-tag" onClick={() => insert(tag)}>{tag}</button>)}</div>
          </div>
          {kind === "reel" && (
            <div className="fb-assist-block">
              <span className="fb-assist-title">Kịch bản Reels</span>
              <ol className="fb-outline">{assistant.reelOutline.map((step) => <li key={step.time}><b>{step.time}</b> {step.label}</li>)}</ol>
            </div>
          )}
          <div className="fb-assist-actions">
            <button type="button" className="fb-button" onClick={() => { void navigator.clipboard?.writeText(assistant.notes); notify("Đã sao chép ghi chú đăng bài."); }}><Copy size={14} />Sao chép ghi chú</button>
            <button type="button" className="fb-button youtube" disabled={transfer === "loading" || !message.trim()} onClick={() => void sendToYouTube()}>
              {transfer === "loading" ? <Loader2 size={14} className="spin" /> : <Play size={14} />}Chuyển sang YouTube
            </button>
          </div>
          <small className="fb-muted">Tiêu đề YouTube gợi ý: <strong>{assistant.youtube.title}</strong></small>
        </section>
      </aside>
    </div>
  );
}
