/**
 * Facebook Pages publishing rules, assistant and shared helpers.
 * Pure TypeScript: runs in the browser for realtime checks and on the server before any Graph call.
 * Rules are a conservative pre-check based on Meta's public policies (Community Standards,
 * Content Monetization originality, Branded Content disclosure). They reduce risk but do not
 * guarantee approval: Meta's reviewers and automated systems make the final decision.
 */
import { keywordsOf, LIMITS } from "@/lib/policy";

export type FbKind = "text" | "photo" | "video" | "reel";
export type FbLevel = "blocker" | "warning" | "tip";
export const FB_KINDS: FbKind[] = ["text", "photo", "video", "reel"];
export const FB_KIND_LABELS: Record<FbKind, string> = { text: "Bài viết", photo: "Ảnh", video: "Video", reel: "Reels" };

export const FB_LIMITS = {
  textMax: 63206,
  hookChars: 125,
  linksWarn: 3,
  hashtagsWarn: 5,
  reelMinSeconds: 3,
  reelMaxSeconds: 90,
  reelMinShortSide: 720,
  scheduleMinMs: 10 * 60 * 1000,
  scheduleMaxMs: 30 * 24 * 60 * 60 * 1000,
  mediaBytes: 1024 * 1024 * 1024,
};

export interface FbDraft {
  kind: FbKind;
  message: string;
  hasMedia: boolean;
  width: number | null;
  height: number | null;
  seconds: number | null;
  bytes: number | null;
  scheduledAt: Date | null;
  brandedAttested: boolean;
  now?: number;
}
export interface FbFinding { id: string; level: FbLevel; area: string; message: string; fix: string }
export interface FbChecklistItem { id: string; label: string; state: "pass" | "fail" | "todo"; detail?: string }
export interface FbReport {
  score: number;
  grade: string;
  readyToPublish: boolean;
  findings: FbFinding[];
  blockers: FbFinding[];
  warnings: FbFinding[];
  tips: FbFinding[];
  checklist: FbChecklistItem[];
  charCount: number;
  hookPreview: string;
  hashtags: string[];
  links: string[];
}

/** Lower-case and strip Vietnamese diacritics so rules match "chắc chắn" and "chac chan" alike. */
export function fold(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "d").toLowerCase();
}

const RULES = {
  bait: /(like|thich|share|chia se|binh luan|comment|tag|gan the|bam)[^.!?\n]{0,40}(de nhan|nhan (qua|thuong|xu|ma)|de trung|co hoi trung|de duoc tang|nhan ngay)/,
  finance: /(chac chan (kiem|thang|lai)|100 ?% (loi nhuan|thang|an toan|lai)|khong can (lam viec|von)|kiem \d+.{0,15}(moi|\/) ?(ngay|tuan)|lam giau nhanh|dau tu.{0,25}(lai gap|x\d+))/,
  health: /(chua khoi|chua dut diem|than duoc|khong can bac si|cam ket khoi|tri (benh|ung thu) trong)/,
  hate: /(giet nguoi|danh chet|do ran ruoi|lu (cho|chung) no|dan toc (do|no) deu|gore|mau me)/,
  adult: /(18\+|khieu dam|nude|sex video)/,
  copyright: /(reup|re-up|full phim lau|crack|khong phai cua minh|nguon: ?(youtube|tiktok))/,
  clickbait: /(soc|khong the tin|bi xoa|bi cam|khan cap|bi an giau)/,
  branded: /(hop tac|tai tro|quang cao|duoc tra tien|#ad\b|#sponsored|sponsored)/,
  phone: /(?:\+?84|0)(?:[\s.-]?\d){8,10}/,
  bank: /(stk|so tai khoan|tai khoan ngan hang)\s*[:-]?\s*\d{6,}/,
  shortener: /(bit\.ly|tinyurl|goo\.gl|t\.co\/|rebrand\.ly|cutt\.ly)/,
};

export function extractLinks(message: string) {
  return message.match(/https?:\/\/[^\s]+/g) ?? [];
}
export function extractHashtags(message: string) {
  return message.match(/#[\p{L}\p{N}_]+/gu) ?? [];
}

export function scheduleProblem(scheduledAt: Date | null, now = Date.now()): string | null {
  if (!scheduledAt) return null;
  const ms = scheduledAt.getTime() - now;
  if (Number.isNaN(ms)) return "Thời gian lên lịch không hợp lệ.";
  if (ms < FB_LIMITS.scheduleMinMs) return "Facebook chỉ nhận lịch đăng sau ít nhất 10 phút kể từ bây giờ.";
  if (ms > FB_LIMITS.scheduleMaxMs) return "Facebook chỉ cho phép lên lịch tối đa 30 ngày trước.";
  return null;
}

export function analyzeFacebook(draft: FbDraft): FbReport {
  const findings: FbFinding[] = [];
  const message = draft.message.trim();
  const folded = fold(message);
  const links = extractLinks(message);
  const hashtags = extractHashtags(message);
  const add = (finding: FbFinding) => findings.push(finding);

  if (draft.kind === "text" && !message) add({ id: "text-empty", level: "blocker", area: "Nội dung", message: "Bài viết chưa có nội dung.", fix: "Viết nội dung chính trước khi đăng." });
  if (message.length > FB_LIMITS.textMax) add({ id: "text-max", level: "blocker", area: "Nội dung", message: `Nội dung ${message.length} ký tự vượt giới hạn ${FB_LIMITS.textMax} của Facebook.`, fix: "Rút gọn nội dung." });
  if (message && message.length < 40 && draft.kind === "text") add({ id: "text-short", level: "tip", area: "Nội dung", message: "Bài rất ngắn; thêm bối cảnh giúp người xem hiểu và tương tác tự nhiên hơn.", fix: "Thêm một câu bối cảnh hoặc câu hỏi mở." });
  if (!draft.hasMedia && draft.kind !== "text") add({ id: "media-missing", level: "blocker", area: "Tệp đính kèm", message: `Chưa chọn ${FB_KIND_LABELS[draft.kind].toLowerCase()} để đăng.`, fix: "Chọn tệp từ máy tính hoặc điện thoại." });

  if (folded && RULES.bait.test(folded)) add({ id: "bait", level: "blocker", area: "Thu hút tương tác giả", message: "Nội dung yêu cầu like, chia sẻ, bình luận hoặc gắn thẻ để nhận quà. Facebook coi đây là engagement bait và có thể giảm phân phối hoặc gỡ bài.", fix: "Mời người xem trao đổi tự nhiên, ví dụ: “Bạn nghĩ sao về cách này?”." });
  if (folded && RULES.finance.test(folded)) add({ id: "finance", level: "blocker", area: "Lừa đảo & tài chính", message: "Có lời hứa thu nhập hoặc lợi nhuận chắc chắn. Chính sách Facebook cấm quảng cáo và nội dung lừa đảo tài chính.", fix: "Chỉ mô tả trải nghiệm và kết quả có thể kiểm chứng, không hứa lợi nhuận." });
  if (folded && RULES.health.test(folded)) add({ id: "health", level: "blocker", area: "Thông tin sức khoẻ", message: "Có khẳng định chữa bệnh hoặc thay thế bác sĩ. Đây là nội dung sức khoẻ sai lệch.", fix: "Ghi rõ đây là kinh nghiệm cá nhân và khuyến nghị gặp bác sĩ." });
  if (folded && RULES.hate.test(folded)) add({ id: "hate", level: "blocker", area: "Bạo lực & thù ghét", message: "Có ngôn từ bạo lực hoặc công kích nhóm người.", fix: "Diễn đạt quan điểm mà không công kích cá nhân hay nhóm." });
  if (folded && RULES.adult.test(folded)) add({ id: "adult", level: "blocker", area: "Nội dung người lớn", message: "Có dấu hiệu nội dung người lớn hoặc khiêu dâm.", fix: "Loại bỏ nội dung này khỏi bài đăng." });
  if (folded && RULES.copyright.test(folded)) add({ id: "copyright", level: "warning", area: "Bản quyền & tính gốc", message: "Có dấu hiệu nội dung không phải của bạn. Nội dung tái đăng dễ bị khiếu nại bản quyền và không đủ điều kiện kiếm tiền.", fix: "Ghi nguồn đầy đủ và thêm góc nhìn, bình luận hoặc phân tích của bạn." });
  if (folded && RULES.clickbait.test(folded)) add({ id: "clickbait", level: "warning", area: "Tiêu đề gây hiểu lầm", message: "Ngôn từ giật tít có thể làm giảm độ tin cậy và bị hạn chế phân phối nếu nội dung không đúng như mô tả.", fix: "Nêu đúng điều người xem sẽ nhận được." });
  if (folded && RULES.branded.test(folded) && !draft.brandedAttested) add({ id: "branded", level: "blocker", area: "Nội dung có thương hiệu", message: "Bài có dấu hiệu hợp tác hoặc quảng cáo nhưng chưa xác nhận đã gắn nhãn nội dung có thương hiệu.", fix: "Bật công cụ Nội dung có thương hiệu trong Meta trước khi đăng, rồi xác nhận ở form." });
  if (folded && RULES.phone.test(folded)) add({ id: "phone", level: "warning", area: "Thông tin cá nhân", message: "Có thể đang đăng số điện thoại công khai, dễ bị spam hoặc lừa đảo.", fix: "Dùng liên hệ qua tin nhắn của Trang thay vì số điện thoại." });
  if (folded && RULES.bank.test(folded)) add({ id: "bank", level: "blocker", area: "Thông tin tài khoản", message: "Có số tài khoản ngân hàng công khai, rủi ro lừa đảo rất cao.", fix: "Xoá số tài khoản khỏi bài đăng." });

  if (links.length > FB_LIMITS.linksWarn) add({ id: "links-many", level: "warning", area: "Liên kết", message: `${links.length} liên kết trong một bài có thể bị xem là spam.`, fix: "Giữ 1–2 liên kết quan trọng nhất." });
  if (links.some((link) => RULES.shortener.test(fold(link)))) add({ id: "links-short", level: "warning", area: "Liên kết", message: "Liên kết rút gọn khiến người xem khó kiểm tra đích đến; Facebook có thể hạn chế phân phối.", fix: "Dùng liên kết đầy đủ tới nguồn chính thức." });
  if (links.length && (draft.kind === "text" || draft.kind === "photo")) add({ id: "links-reach", level: "tip", area: "Tiếp cận", message: "Liên kết trong nội dung chính có thể làm giảm tiếp cận so với bài không có liên kết.", fix: "Đưa liên kết vào bình luận đầu tiên của Trang." });
  if (hashtags.length > FB_LIMITS.hashtagsWarn) add({ id: "hashtags", level: "warning", area: "Hashtag", message: `${hashtags.length} hashtag có thể bị xem là spam.`, fix: "Giữ 2–3 hashtag liên quan nhất." });
  const letters = message.replace(/[^\p{L}]/gu, "");
  const upper = letters.replace(/[^\p{Lu}]/gu, "");
  if (letters.length > 20 && upper.length / letters.length > 0.6) add({ id: "caps", level: "warning", area: "Định dạng", message: "Phần lớn chữ viết HOA, dễ bị xem là gây chú ý quá mức.", fix: "Chỉ viết hoa tên riêng và từ khoá cần nhấn mạnh." });

  if (draft.kind === "reel") {
    if (draft.seconds === null) add({ id: "reel-duration", level: "warning", area: "Reels", message: "Chưa xác định được thời lượng video.", fix: "Chọn lại video để TubeFlow đọc thông số." });
    else if (draft.seconds < FB_LIMITS.reelMinSeconds || draft.seconds > FB_LIMITS.reelMaxSeconds) add({ id: "reel-length", level: "blocker", area: "Reels", message: `Reels dài ${Math.round(draft.seconds)} giây, ngoài khoảng ${FB_LIMITS.reelMinSeconds}–${FB_LIMITS.reelMaxSeconds} giây.`, fix: "Cắt lại trong Phòng dựng." });
    if (draft.width && draft.height) {
      if (draft.height < draft.width) add({ id: "reel-ratio", level: "warning", area: "Reels", message: "Reels nên dọc 9:16 để hiển thị toàn màn hình.", fix: "Xuất khung 9:16 (1080x1920) trong Phòng dựng." });
      if (Math.min(draft.width, draft.height) < FB_LIMITS.reelMinShortSide) add({ id: "reel-resolution", level: "warning", area: "Reels", message: "Độ phân giải thấp hơn 720p có thể bị mờ hoặc lỗi xử lý.", fix: "Xuất ít nhất 720p, tốt nhất 1080x1920." });
    }
  }
  if (draft.kind === "video" && draft.seconds && draft.seconds > 240) add({ id: "video-long", level: "tip", area: "Video", message: "Video dài nên có mốc thời gian hoặc đoạn mở đầu hấp dẫn để giữ người xem.", fix: "Thêm 3 giây mở đầu có điểm nhấn." });

  const timing = scheduleProblem(draft.scheduledAt, draft.now);
  if (timing) add({ id: "schedule", level: "blocker", area: "Lịch đăng", message: timing, fix: "Chọn thời điểm trong khoảng 10 phút đến 30 ngày." });

  const blockers = findings.filter((f) => f.level === "blocker");
  const warnings = findings.filter((f) => f.level === "warning");
  const tips = findings.filter((f) => f.level === "tip");
  const score = Math.max(0, 100 - findings.reduce((sum, f) => sum + (f.level === "blocker" ? 20 : f.level === "warning" ? 8 : 2), 0));
  const grade = score >= 92 ? "A+" : score >= 82 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : "D";
  const hasFinding = (id: string) => findings.some((f) => f.id === id);
  const mediaOk = draft.kind === "text" ? true : draft.hasMedia && !hasFinding("reel-length") && !hasFinding("reel-duration") && !hasFinding("media-missing");
  const checklist: FbChecklistItem[] = [
    { id: "c-media", label: draft.kind === "text" ? "Bài văn bản không cần tệp đính kèm" : `${FB_KIND_LABELS[draft.kind]} đã sẵn sàng`, state: mediaOk ? "pass" : "fail" },
    { id: "c-policy", label: "Không có từ khoá vi phạm Tiêu chuẩn cộng đồng", state: blockers.some((b) => ["bait", "finance", "health", "hate", "adult", "bank", "branded"].includes(b.id)) ? "fail" : "pass" },
    { id: "c-branded", label: "Đã xác nhận nội dung có thương hiệu (nếu có)", state: hasFinding("branded") ? "fail" : draft.brandedAttested ? "pass" : "todo" },
    { id: "c-original", label: "Nội dung gốc (đủ điều kiện kiếm tiền)", state: hasFinding("copyright") ? "fail" : "pass" },
    { id: "c-privacy", label: "Không lộ thông tin cá nhân", state: hasFinding("phone") || hasFinding("bank") ? "fail" : "pass" },
    { id: "c-schedule", label: "Thời điểm đăng hợp lệ", state: timing ? "fail" : draft.scheduledAt ? "pass" : "todo", detail: draft.scheduledAt ? draft.scheduledAt.toLocaleString("vi-VN") : "Đăng ngay" },
  ];

  return {
    score,
    grade,
    readyToPublish: blockers.length === 0,
    findings,
    blockers,
    warnings,
    tips,
    checklist,
    charCount: message.length,
    hookPreview: message.slice(0, FB_LIMITS.hookChars),
    hashtags,
    links,
  };
}

export interface FbAssistant {
  hooks: string[];
  captions: string[];
  ctas: string[];
  hashtags: string[];
  reelOutline: { time: string; label: string }[];
  youtube: { title: string; description: string; tags: string[] };
  notes: string;
}

const clock = (seconds: number) => `00:${String(Math.floor(seconds)).padStart(2, "0")}`;

/**
 * Rule-based assistant: drafts hooks, safe calls-to-action, Reels outline and a YouTube version
 * of the same content (title <= 100 characters, tags within budget). Suggestions avoid the
 * engagement-bait and guarantee patterns that the rules above flag.
 */
export function buildFacebookAssistant(draft: FbDraft, report: FbReport, pageName: string): FbAssistant {
  const firstLine = draft.message.split(/[.!?\n]/).map((line) => line.trim()).find(Boolean) || "";
  const topic = firstLine.slice(0, 80) || "chủ đề này";
  const keys = keywordsOf(draft.message || topic, 4);
  const main = keys[0] || "chủ đề";
  const hashtags = [`#${main.replace(/\s+/g, "")}`, ...keys.slice(1, 3).map((k) => `#${k.replace(/\s+/g, "")}`)].slice(0, 3);
  const body = draft.message.trim() || `Chia sẻ về ${topic}.`;

  const hooks = [
    `Bạn đã từng gặp vấn đề về ${main} chưa?`,
    `Mình đã thử ${main} và điều này khiến mình bất ngờ.`,
    `3 điều về ${main} mà ít người nói tới.`,
  ];
  const captions = [
    body.length > 400 ? body.slice(0, 400) : body,
    `${hooks[0]}\n\n${body.slice(0, 280)}`,
    `${topic}\n\n${body.slice(0, 240)}\n\n${hashtags.join(" ")}`.trim(),
  ].map((text) => text.slice(0, FB_LIMITS.textMax));
  const ctas = [
    "Bạn nghĩ sao? Chia sẻ ý kiến của bạn ở bình luận.",
    `Bạn muốn mình làm phần tiếp theo về ${main} không?`,
    "Lưu lại để xem khi cần nhé.",
  ];
  const seconds = draft.seconds && draft.seconds > 0 ? Math.min(draft.seconds, FB_LIMITS.reelMaxSeconds) : 30;
  const reelOutline = [
    { time: `${clock(0)}–${clock(3)}`, label: `Hook: nêu ngay kết quả hoặc câu hỏi về ${main}.` },
    { time: `${clock(3)}–${clock(Math.max(4, seconds - 6))}`, label: "Giá trị: 2–3 bước thực hành, mỗi bước một cảnh ngắn có chữ trên màn hình." },
    { time: `${clock(Math.max(4, seconds - 6))}–${clock(seconds)}`, label: "Kết: một câu hỏi mở cho khán giả, không kêu gọi tương tác đổi quà." },
  ];

  const titleSource = topic.charAt(0).toUpperCase() + topic.slice(1);
  const youtubeTitle = titleSource.slice(0, LIMITS.title);
  const youtubeDescription = [body, "", `Kênh: ${pageName}`, hashtags.join(" ")].join("\n").slice(0, LIMITS.description);
  const youtubeTags: string[] = [];
  let tagBytes = 0;
  for (const tag of [main, ...keys.slice(1), pageName].map((tag) => tag.trim()).filter(Boolean)) {
    if (tagBytes + tag.length + 1 > LIMITS.tagBytes - 20) break;
    if (!youtubeTags.includes(tag)) { youtubeTags.push(tag); tagBytes += tag.length + 1; }
  }

  const notes = [
    `GHI CHÚ ĐĂNG FACEBOOK — ${pageName}`,
    `Loại: ${FB_KIND_LABELS[draft.kind]} · Điểm an toàn: ${report.score}/100 (${report.grade})`,
    report.readyToPublish ? "Trạng thái: sẵn sàng đăng." : "Trạng thái: còn lỗi chặn, chưa nên đăng.",
    ...report.findings.map((f, index) => `${index + 1}. [${f.area}] ${f.message}${f.fix ? ` → ${f.fix}` : ""}`),
    "Sau khi đăng: trả lời bình luận trong 24 giờ đầu; không yêu cầu người xem tag bạn bè để nhận quà; kiểm tra thông báo Meta về bản quyền.",
  ].join("\n").slice(0, 5000);

  return { hooks, captions, ctas, hashtags, reelOutline, youtube: { title: youtubeTitle, description: youtubeDescription, tags: youtubeTags }, notes };
}

export interface EarningRow { date: string; amount: string; currency: string; source: string; note: string }

const AMOUNT = /^\d+(\.\d{1,2})?$/;

function normalizeDate(raw: string): string | null {
  const value = raw.trim();
  let iso: string | null = null;
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value);
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (ymd) iso = value;
  else if (dmy) iso = `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  if (!iso) return null;
  const parsed = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso ? null : iso;
}

/**
 * Parses exports from Meta Business Suite or a spreadsheet. Columns: date, amount, currency, source, note.
 * Separators: comma, semicolon or tab. Amount uses a dot decimal and must not contain thousands separators.
 */
export function parseEarningsCsv(text: string): { rows: EarningRow[]; errors: string[] } {
  const rows: EarningRow[] = [];
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length > 500) errors.push("Tệp có hơn 500 dòng; chia nhỏ để nhập.");
  lines.slice(0, 500).forEach((line, index) => {
    if (index === 0 && /(date|ngay|ngày)/i.test(line) && /(amount|so tien|số tiền|earn|thu nhap|thu nhập)/i.test(line)) return;
    const parts = line.split(/[,;\t]/).map((part) => part.trim());
    const [date, amount, currency = "USD", source = "Meta", ...noteParts] = parts;
    const iso = normalizeDate(date || "");
    const cleanAmount = (amount || "").replace(/\s/g, "");
    if (!iso) { errors.push(`Dòng ${index + 1}: ngày không hợp lệ (dùng YYYY-MM-DD hoặc DD/MM/YYYY).`); return; }
    if (!AMOUNT.test(cleanAmount)) { errors.push(`Dòng ${index + 1}: số tiền “${amount}” không hợp lệ (dùng dấu chấm cho số thập phân, không có dấu phẩy ngăn cách hàng nghìn).`); return; }
    rows.push({ date: iso, amount: cleanAmount, currency: (currency || "USD").toUpperCase().slice(0, 6), source: source.slice(0, 60) || "Meta", note: noteParts.join(", ").slice(0, 300) });
  });
  return { rows, errors };
}

export const EARNING_SOURCES = ["Meta", "Nội dung Facebook", "Reels", "Thưởng", "Khác"];
export function isValidAmount(value: string) { return AMOUNT.test(value); }
export function isValidDate(value: string) { return normalizeDate(value) !== null; }
export function normalizeIsoDate(value: string) { return normalizeDate(value); }
