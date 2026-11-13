/**
 * TikTok community-guidelines pre-check, trend-aware assistant and shared helpers.
 * Pure TypeScript: runs in the browser for realtime feedback and on the server before any API call.
 * TikTok makes the final moderation decision; this is an early filter, not a guarantee.
 */
import { keywordsOf } from "@/lib/policy";

export type TkPrivacy = "SELF_ONLY" | "MUTUAL_FOLLOW_FRIENDS" | "FOLLOWER_OF_CREATOR" | "PUBLIC_TO_EVERYONE";
export const TK_PRIVACY: { id: TkPrivacy; label: string; note: string }[] = [
  { id: "PUBLIC_TO_EVERYONE", label: "Công khai", note: "Mọi người có thể xem. Cần app đã qua kiểm duyệt của TikTok." },
  { id: "FOLLOWER_OF_CREATOR", label: "Người theo dõi", note: "Chỉ người đang theo dõi bạn." },
  { id: "MUTUAL_FOLLOW_FRIENDS", label: "Bạn bè", note: "Chỉ người bạn theo dõi lại." },
  { id: "SELF_ONLY", label: "Chỉ mình tôi", note: "Video riêng tư — bắt buộc khi app chưa qua kiểm duyệt." },
];

export const TK_LIMITS = {
  titleMax: 2200,
  hookChars: 90,
  hashtagsWarn: 6,
  hashtagsIdeal: 4,
  minSeconds: 3,
  maxSeconds: 600,
  trendSecondsMin: 21,
  trendSecondsMax: 34,
  maxBytes: 4 * 1024 * 1024 * 1024,
  directPostsPerDay: 15,
  draftsPerDay: 5,
  minShortSide: 720,
};

export type TkLevel = "blocker" | "warning" | "tip";
export interface TkDraft {
  title: string;
  privacyLevel: TkPrivacy;
  hasMedia: boolean;
  width: number | null;
  height: number | null;
  seconds: number | null;
  bytes: number | null;
  disableComment: boolean;
  disableDuet: boolean;
  disableStitch: boolean;
}
export interface TkFinding { id: string; level: TkLevel; area: string; message: string; fix: string }
export interface TkChecklistItem { id: string; label: string; state: "pass" | "fail" | "todo"; detail?: string }
export interface TkReport {
  score: number;
  grade: string;
  readyToPublish: boolean;
  findings: TkFinding[];
  blockers: TkFinding[];
  warnings: TkFinding[];
  tips: TkFinding[];
  checklist: TkChecklistItem[];
  charCount: number;
  hookPreview: string;
  hashtags: string[];
  trendScore: number;
  trendNotes: string[];
}

/** Lower-case and strip Vietnamese diacritics so rules match accents or not. */
export function fold(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "d").toLowerCase();
}

const RULES = {
  sexual: /(18\+|khieu dam|khoi than|nude|sex|hiếp|doi giao)/,
  violence: /(giet nguoi|danh chet|hai qua|tan sat|mau me|xac chet|dao phay)/,
  hate: /(lu (cho|chung) no|dân tộc kia đều|do ran ruoi|rac nuoc|phan biet chung toc|hom nay ta se giet)/,
  harass: /(cho chet di|thang ran con|tao se tim mi|den nha mi|danh no di)/,
  dangerous: /^(chien|thử thách (toc do|nguy hiem))|che (bom|dao)|lam thuoc no|thu nghiem chat gay nghien|tu che vu khi|chay xe may ban dem/,
  misinformation: /(vaccine gay|trái đất phẳng|covid la giua|thien tai vi trung quoc|benh nan y khoi sau 3 ngay)/,
  integrity: /(reup|re-up|lai video cua|chup nhat video|tai khoan gia|hack tai khoan|mua ban acc)/,
  spam: /^(tuong tac tuong|hack like|sub chéo|treo tuong tac|nhieu acc)|tang (view|follower|like) (truc tuyen|nhanh|gia re)/,
  minors: /(be (gai|trai) 1[0-2] tuoi mat ao|tre em (khoe than|lanh canh noi y))|nu sinh thpt (khoe than|tho y)/,
  illegal: /(ban (ma tuy|vu khi|thuoc phien)|chay the|choi bac online|danh bac truc tuyen)/,
  clickbait: /soc|khong the tin|bi cam vi|canh bao khan cap|chac chan (ban chua bao gio)/,
  engagementBait: /^(comment|binh luan|binh luan de|tag (ban be|2 nguoi))\b|comment "(\+1|ok)" de (nhan|duoc)/,
};

export function extractHashtags(title: string) {
  return title.match(/#[\p{L}\p{N}_]+/gu) ?? [];
}
export function extractMentions(title: string) {
  return title.match(/@[\p{L}\p{N}._]+/gu) ?? [];
}

export function analyzeTikTok(draft: TkDraft): TkReport {
  const findings: TkFinding[] = [];
  const title = draft.title.trim();
  const folded = fold(title);
  const hashtags = extractHashtags(title);
  const mentions = extractMentions(title);
  const add = (finding: TkFinding) => findings.push(finding);

  if (!title) add({ id: "title-empty", level: "blocker", area: "Chú thích", message: "Chưa có chú thích cho video.", fix: "Viết chú thích ngắn, nêu ngay giá trị ở câu đầu." });
  if (title.length > TK_LIMITS.titleMax) add({ id: "title-max", level: "blocker", area: "Chú thích", message: `Chú thích ${title.length} ký tự vượt giới hạn ${TK_LIMITS.titleMax} của TikTok.`, fix: "Rút gọn chú thích." });
  if (title && title.length < 40) add({ id: "title-short", level: "tip", area: "Chú thích", message: "Chú thích khá ngắn; thêm ngữ cảnh giúp video dễ được hiểu và tìm thấy.", fix: "Thêm 1 câu mô tả nội dung hoặc kết quả người xem nhận được." });
  if (title && title.length > 300) add({ id: "title-long", level: "warning", area: "Chú thích", message: "Chú thích dài; TikTok hiển thị ưu tiên phần đầu nên quá nhiều chữ làm loãng thông điệp.", fix: "Đưa ý chính về câu đầu, phần còn lại là hashtag và ghi chú." });

  if (!draft.hasMedia) add({ id: "media-missing", level: "blocker", area: "Tệp video", message: "Chưa chọn video để đăng.", fix: "Chọn một video từ máy hoặc Phòng dựng." });
  if (draft.bytes && draft.bytes > TK_LIMITS.maxBytes) add({ id: "media-size", level: "blocker", area: "Tệp video", message: `Tệp ${(draft.bytes / 1024 / 1024 / 1024).toFixed(2)} GB vượt giới hạn 4GB.`, fix: "Nén video hoặc cắt bớt thời lượng." });

  // Community Guidelines.
  if (folded && RULES.sexual.test(folded)) add({ id: "sexual", level: "blocker", area: "Nội dung người lớn", message: "Có dấu hiệu nội dung khiêu dâm hoặc người lớn. Đây là nguyên nhân gỡ video và hạn chế tài khoản hàng đầu.", fix: "Loại bỏ hoàn toàn nội dung này." });
  if (folded && RULES.violence.test(folded)) add({ id: "violence", level: "blocker", area: "Bạo lực & gây sốc", message: "Có nội dung bạo lực hoặc gây sốc.", fix: "Thay bằng góc nhìn an toàn hoặc cắt cảnh nhạy cảm." });
  if (folded && RULES.hate.test(folded)) add({ id: "hate", level: "blocker", area: "Thù ghét", message: "Ngôn từ công kích cá nhân hoặc nhóm người, vi phạm chính sách thù ghét.", fix: "Nêu quan điểm mà không hạ nhục ai." });
  if (folded && RULES.harass.test(folded)) add({ id: "harass", level: "blocker", area: "Quấy rối", message: "Có lời đe doạ hoặc kêu gọi tấn công người khác.", fix: "Gỡ bỏ nội dung đe doạ." });
  if (folded && RULES.dangerous.test(folded)) add({ id: "dangerous", level: "blocker", area: "Hành vi nguy hiểm", message: "Có hướng dẫn hoặc thao diễn hành vi nguy hiểm; TikTok nghiêm cấm mạnh với nội dung này.", fix: "Loại bỏ hoặc ghi rõ đây là thí nghiệm an toàn có chuyên gia." });
  if (folded && RULES.misinformation.test(folded)) add({ id: "misinfo", level: "blocker", area: "Thông tin sai lệch", message: "Có khẳng định y tế hoặc khoa học sai lệch.", fix: "Trích dẫn nguồn chính thống và ghi rõ phạm vi phát biểu." });
  if (folded && RULES.integrity.test(folded)) add({ id: "integrity", level: "warning", area: "Tính xác thực", message: "Có dấu hiệu nội dung tái đăng hoặc không phải của bạn.", fix: "Ghi nguồn, thêm phản ứng/bình luận của riêng bạn — nội dung gốc mới đủ điều kiện kiếm tiền." });
  if (folded && RULES.spam.test(folded)) add({ id: "spam", level: "blocker", area: "Spam & gian lận", message: "Có nội dung mua bán tương tác, hack like hoặc tăng follower.", fix: "Xoá phần này; TikTok khoá tài khoản vì gian lận tương tác." });
  if (folded && RULES.minors.test(folded)) add({ id: "minors", level: "blocker", area: "An toàn trẻ em", message: "Có dấu hiệu liên quan tới hình ảnh trẻ em nhạy cảm.", fix: "Xoá ngay và không đăng lại ở bất kỳ dạng nào." });
  if (folded && RULES.illegal.test(folded)) add({ id: "illegal", level: "blocker", area: "Hoạt động bất hợp pháp", message: "Có nội dung liên quan ma tuý, vũ khí, cờ bạc hoặc buôn bán trái phép.", fix: "Xoá nội dung này." });
  if (folded && RULES.clickbait.test(folded)) add({ id: "clickbait", level: "warning", area: "Giật tít", message: "Ngôn từ phóng đại có thể bị đánh dấu gây hiểu lầm nếu nội dung không đúng như vậy.", fix: "Mô tả đúng điều người xem sẽ thấy." });
  if (folded && RULES.engagementBait.test(folded)) add({ id: "bait", level: "warning", area: "Kêu gọi tương tác", message: "Kêu gọi bình luận/gắn thẻ đổi quà dễ bị xếp loại spam tương tác.", fix: "Thay bằng câu hỏi mở về nội dung video." });

  // Hashtags and mentions.
  if (hashtags.length > TK_LIMITS.hashtagsWarn) add({ id: "hashtags", level: "warning", area: "Hashtag", message: `${hashtags.length} hashtag có thể bị coi là spam hashtag.`, fix: `Giữ ${TK_LIMITS.hashtagsIdeal} hashtag: 1 chủ đề rộng, 1 chủ đề hẹp, 1 hashtag cộng đồng.` });
  if (mentions.length > 3) add({ id: "mentions", level: "warning", area: "Đề cập", message: `${mentions.length} lượt @mention có thể bị giới hạn phân phối.`, fix: "Chỉ @ những tài khoản thực sự liên quan." });
  if (hashtags.length === 0 && title) add({ id: "hashtags-none", level: "tip", area: "Hashtag", message: "Chưa có hashtag. TikTok phân phối mạnh theo tín hiệu hashtag.", fix: "Thêm 3–4 hashtag liên quan, tránh hashtag không liên quan để câu view." });

  // Format and reach.
  const seconds = draft.seconds && draft.seconds > 0 ? draft.seconds : null;
  if (seconds !== null) {
    if (seconds < TK_LIMITS.minSeconds) add({ id: "short-clip", level: "blocker", area: "Thời lượng", message: `Video ${Math.round(seconds)} giây, dưới ngưỡng tối thiểu ${TK_LIMITS.minSeconds} giây của TikTok.`, fix: "Kéo dài hoặc ghép thêm cảnh." });
    if (seconds > TK_LIMITS.maxSeconds) add({ id: "long-clip", level: "blocker", area: "Thời lượng", message: `Video ${Math.round(seconds)} giây vượt giới hạn của TikTok.`, fix: "Cắt bớt hoặc chia thành nhiều phần." });
    if (seconds >= 35 && seconds <= 60) add({ id: "length-mid", level: "tip", area: "Tỉ lệ giữ chân", message: "Video 35–60 giây khó giữ chân trọn vẹn; giữ 21–34 giây là khoảng dễ lan truyền nhất.", fix: "Cắt cảnh thừa để video ngắn hơn." });
    if (seconds > 60 && seconds < 180) add({ id: "length-long", level: "tip", area: "Tỉ lệ giữ chân", message: "Video trên 60 giây cần hook mạnh ở 3 giây đầu để không bị bỏ qua.", fix: "Đưa khoảnh khắc hấp dẫn nhất lên đầu." });
  }
  if (draft.width && draft.height) {
    const ratio = draft.height / draft.width;
    if (ratio < 1.15) add({ id: "ratio", level: "warning", area: "Khung hình", message: `Khung ${draft.width}×${draft.height} không phải dọc 9:16; TikTok hiển thị không tối ưu và video sẽ có viền đen.`, fix: "Xuất dọc 1080×1920 trong Phòng dựng." });
    if (Math.min(draft.width, draft.height) < TK_LIMITS.minShortSide) add({ id: "resolution", level: "warning", area: "Độ phân giải", message: "Độ phân giải dưới 720p làm video mờ trên điện thoại.", fix: "Xuất tối thiểu 1080×1920." });
    if (draft.height > draft.width && draft.height / draft.width > 1.9) add({ id: "ratio-skinny", level: "tip", area: "Khung hình", message: "Khung quá hẹp so với 9:16, người xem thấy hình không cân.", fix: "Cắt về đúng 9:16 (1080×1920)." });
  }

  // Privacy and reach.
  if (draft.privacyLevel === "SELF_ONLY") add({ id: "privacy-private", level: "warning", area: "Khả năng phân phối", message: "Video đang đặt riêng tư (chỉ mình tôi): không ai thấy, không tích luỹ lượt xem.", fix: "Đặt Công khai sau khi app được TikTok kiểm duyệt." });
  if (draft.privacyLevel !== "PUBLIC_TO_EVERYONE" && draft.privacyLevel !== "SELF_ONLY") add({ id: "privacy-limited", level: "tip", area: "Khả năng phân phối", message: "Video chỉ hiển thị cho một nhóm người, nên ít khả năng lên xu hướng.", fix: "Đặt Công khai nếu muốn video được phân phối rộng." });
  if (draft.disableComment) add({ id: "no-comment", level: "tip", area: "Tương tác", message: "Đã tắt bình luận — bình luận là tín hiệu quan trọng với thuật toán.", fix: "Bật bình luận trừ khi lý do riêng." });

  const blockers = findings.filter((f) => f.level === "blocker");
  const warnings = findings.filter((f) => f.level === "warning");
  const tips = findings.filter((f) => f.level === "tip");
  const score = Math.max(0, 100 - findings.reduce((sum, f) => sum + (f.level === "blocker" ? 20 : f.level === "warning" ? 8 : 2), 0));
  const grade = score >= 92 ? "A+" : score >= 82 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : "D";

  // Trend readiness: separate from policy safety, measures discoverability.
  const trendSignals: { hit: boolean; note: string }[] = [
    { hit: seconds !== null && seconds >= TK_LIMITS.trendSecondsMin && seconds <= TK_LIMITS.trendSecondsMax, note: `Thời lượng ${seconds ? Math.round(seconds) : "?"} giây nằm trong khoảng dễ lan truyền 21–34 giây.` },
    { hit: hashtags.length >= 2 && hashtags.length <= 5, note: `${hashtags.length} hashtag — mức phù hợp để phân phối.` },
    { hit: title.length > 0 && title.length <= 150, note: "Chú thích ngắn gọn, thông điệp rõ trong câu đầu." },
    { hit: draft.hasMedia && draft.height !== null && draft.height > (draft.width ?? 0), note: "Khung hình dọc — hiển thị toàn màn hình." },
    { hit: title.includes("#") && /[?]\s*$/.test(title.trim()), note: "Có câu hỏi ở cuối — khơi gợi bình luận tự nhiên." },
    { hit: title.trim().length > 0 && title.trim().split(/\s+/).length <= 22, note: "Chú thích dễ đọc trên điện thoại." },
  ];
  const trendScore = Math.round((trendSignals.filter((signal) => signal.hit).length / trendSignals.length) * 100);

  const checklist: TkChecklistItem[] = [
    { id: "c-media", label: "Video sẵn sàng, khung dọc", state: !draft.hasMedia || !!(draft.height && draft.height > (draft.width ?? 0)) ? (draft.hasMedia ? "pass" : "fail") : "fail" },
    { id: "c-policy", label: "Không chạm Nguyên tắc cộng đồng", state: blockers.length ? "fail" : "pass" },
    { id: "c-caption", label: `Chú thích ≤ ${TK_LIMITS.titleMax} ký tự`, state: title && title.length <= TK_LIMITS.titleMax ? "pass" : "fail", detail: `${title.length}` },
    { id: "c-hashtags", label: `Hashtag trong khoảng ${TK_LIMITS.hashtagsIdeal}`, state: hashtags.length >= 2 && hashtags.length <= 5 ? "pass" : hashtags.length ? "todo" : "todo", detail: `${hashtags.length}` },
    { id: "c-duration", label: `Thời lượng ${TK_LIMITS.minSeconds}–${TK_LIMITS.maxSeconds} giây`, state: seconds === null ? "todo" : seconds < TK_LIMITS.minSeconds || seconds > TK_LIMITS.maxSeconds ? "fail" : "pass", detail: seconds ? `${Math.round(seconds)}s` : undefined },
    { id: "c-privacy", label: "Chế độ hiển thị phù hợp", state: draft.privacyLevel === "SELF_ONLY" ? "todo" : "pass", detail: TK_PRIVACY.find((item) => item.id === draft.privacyLevel)?.label },
    { id: "c-interaction", label: "Bình luận/Duet/Stitch được bật", state: draft.disableComment || draft.disableDuet || draft.disableStitch ? "todo" : "pass" },
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
    charCount: title.length,
    hookPreview: title.slice(0, TK_LIMITS.hookChars),
    hashtags,
    trendScore,
    trendNotes: trendSignals.filter((signal) => signal.hit).map((signal) => signal.note),
  };
}



export interface TkAssistant {
  hooks: string[];
  captions: string[];
  hashtags: string[];
  trendIdeas: string[];
  pacing: { time: string; label: string }[];
  youtube: { title: string; description: string; tags: string[] };
  notes: string;
}

const clock = (seconds: number) => `00:${String(Math.floor(seconds)).padStart(2, "0")}`;

/**
 * Trend-aware assistant: hook variations, hashtags, pacing for short-form video and a YouTube version
 * of the same content. Suggestions avoid engagement-bait and guarantee patterns that the rules flag.
 */
export function buildTikTokAssistant(draft: TkDraft, report: TkReport, displayName: string): TkAssistant {
  const firstLine = draft.title.split(/[.!?\n]/).map((line) => line.trim()).find(Boolean) || "";
  const topic = firstLine.slice(0, 70) || "chủ đề này";
  const keys = keywordsOf(draft.title || topic, 5);
  const main = keys[0] || "chu-de";
  const handle = displayName.trim() || "kênh của bạn";
  const seconds = draft.seconds && draft.seconds > 0 ? Math.min(draft.seconds, TK_LIMITS.maxSeconds) : 30;

  const hooks = [
    `Bạn có đang gặp vấn đề với ${main}?`,
    `Mình mất ${Math.max(3, Math.round(seconds / 4))} giây để nhận ra điều này về ${main}.`,
    `3 điều ít người nói về ${main}.`,
  ];
  const hashtags = [
    `#${main.replace(/\s+/g, "")}`,
    `#${keys[1]?.replace(/\s+/g, "") || "kinhnghiem"}`,
    "#hoidapnhanh",
  ];
  const captions = [
    `${topic}\n${hashtags.join(" ")}\nBạn nghĩ sao?`,
    `${hooks[0]}\n\n${topic.slice(0, 120)}\n${hashtags.join(" ")}`,
    `#${main.replace(/\s+/g, "")} · ${topic.slice(0, 90)}\nĐể lại câu hỏi của bạn nhé.`,
  ].map((text) => text.slice(0, TK_LIMITS.titleMax));

  const trendIdeas = [
    `Đu trend âm thanh hot gắn với ${main}: chọn một đoạn nhạc thịnh hành rồi lồng câu chuyện của bạn.`,
    `Phản ứng/tố chất bản thân với ${main}: quay thật, không dựng quá chỉn chu để giữ cảm giác gần.`,
    `Series “Ngày 1 – Ngày 7 học ${main}”: video ngắn theo dõi tiến trình, dễ tạo thói quen theo dõi.`,
    `Trả lời một bình luận phổ biến về ${main} bằng video — TikTok ưu tiên nội dung từ tương tác thật.`,
  ];

  const pacing = [
    { time: `${clock(0)}–${clock(3)}`, label: "Hook: kết quả hoặc câu hỏi ngay giây đầu, có chữ lớn trên màn hình." },
    { time: `${clock(3)}–${clock(Math.max(4, seconds - 4))}`, label: "Nội dung: 2–3 ý ngắn, mỗi ý một cảnh, đổi góc máy để giữ nhịp." },
    { time: `${clock(Math.max(4, seconds - 4))}–${clock(seconds)}`, label: "Kết: một câu hỏi gợi bình luận, không kêu gọi đổi quà." },
  ];

  const youtubeTitle = (topic.charAt(0).toUpperCase() + topic.slice(1)).slice(0, 100);
  const youtubeDescription = [topic, "", `Kênh: ${handle}`, hashtags.join(" ")].join("\n").slice(0, 5000);
  const youtubeTags: string[] = [];
  let used = 0;
  for (const tag of [main, ...keys.slice(1), handle].map((tag) => tag.trim()).filter(Boolean)) {
    if (used + tag.length + 1 > 480) break;
    if (!youtubeTags.includes(tag)) { youtubeTags.push(tag); used += tag.length + 1; }
  }

  const notes = [
    `GHI CHÚ ĐĂNG TIKTOK — ${handle}`,
    `Chế độ hiển thị: ${TK_PRIVACY.find((item) => item.id === draft.privacyLevel)?.label ?? draft.privacyLevel} · Điểm an toàn: ${report.score}/100 (${report.grade}) · Sẵn sàng trend: ${report.trendScore}%`,
    report.readyToPublish ? "Trạng thái: đủ điều kiện gửi." : `Trạng thái: còn ${report.blockers.length} lỗi chặn, chưa nên đăng.`,
    ...report.findings.map((finding, index) => `${index + 1}. [${finding.area}] ${finding.message}${finding.fix ? ` → ${finding.fix}` : ""}`),
    `Hashtag gợi ý: ${hashtags.join(" ")}`,
    "Sau khi đăng: trả lời bình luận trong 1–2 giờ đầu; không dùng dịch vụ tăng tương tác; video mới nên đăng cách nhau vài giờ thay vì dồn một lúc.",
  ].join("\n").slice(0, 5000);

  return { hooks, captions, hashtags, trendIdeas, pacing, youtube: { title: youtubeTitle, description: youtubeDescription, tags: youtubeTags }, notes };
}
