/**
 * YouTube compliance & optimization engine.
 * Pure module: chạy được cả trên client (điểm realtime) lẫn server.
 * Mọi giới hạn cứng lấy theo chính sách YouTube hiện hành:
 * tiêu đề 100 ký tự, mô tả 5000 ký tự, tổng tag 500 ký tự,
 * thumbnail 1280x720 tối đa 2MB, Shorts tối đa 180 giây, COPPA/made-for-kids.
 */

export type ContentKind = "video" | "short" | "live" | "image";
export type Level = "blocker" | "warning" | "tip";

export interface ThumbnailMeta {
  width: number;
  height: number;
  bytes: number;
}

export interface MetadataDraft {
  kind: ContentKind;
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
  madeForKids: boolean;
  privacyStatus: string;
  paidPromotion: boolean;
  language: string;
  hasCaptions: boolean;
  durationSeconds: number | null;
  thumbnail: ThumbnailMeta | null;
  handle: string;
}

export interface Finding {
  id: string;
  level: Level;
  area: string;
  message: string;
  fix?: string;
}

export interface ChecklistItem {
  id: string;
  label: string;
  state: "pass" | "fail" | "todo";
  detail?: string;
}

export interface PolicyReport {
  score: number;
  grade: string;
  readyToPublish: boolean;
  findings: Finding[];
  blockers: Finding[];
  warnings: Finding[];
  tips: Finding[];
  checklist: ChecklistItem[];
  tagBudget: { used: number; limit: number };
}

export const LIMITS = {
  title: 100,
  titleVisible: 70,
  description: 5000,
  descriptionVisible: 150,
  tagBytes: 500,
  tagCount: 15,
  thumbWidth: 1280,
  thumbHeight: 720,
  thumbBytes: 2 * 1024 * 1024,
  shortSeconds: 180,
  fileBytes: 2 * 1024 * 1024 * 1024,
};

/** Nhóm nội dung bị Nguyên tắc cộng đồng YouTube xử lý. */
const BANNED_GROUPS: { area: string; words: string[]; why: string }[] = [
  { area: "Bạo lực & nội dung gây sốc", words: ["giết người", "máu me", "xác chết", "đánh nhau tới chết", "gore", "tử thi"], why: "Nguyên tắc cộng đồng về nội dung bạo lực hoặc gây sốc." },
  { area: "Thù ghét & quấy rối", words: ["lũ chúng nó", "dân tộc đó đều", "đồ rác rưởi", "hate speech", "phân biệt chủng tộc"], why: "Nguyên tắc cộng đồng về nội dung thù ghét và quấy rối." },
  { area: "Lừa đảo & spam", words: ["kiếm tiền nhanh 100%", "đầu tư chắc thắng", "tặng thẻ cào miễn phí", "bấm vào link để nhận", "get rich quick", "scam free money"], why: "Chính sách Spam, hành vi lừa đảo và gian lận." },
  { area: "Nội dung nguy hiểm", words: ["chế bom", "cách tự chế vũ khí", "thử thách nguy hiểm", "hack tài khoản", "bẻ khóa"], why: "Chính sách về hành vi nguy hiểm và thách thức mạo hiểm." },
  { area: "Thông tin y tế sai lệch", words: ["chữa khỏi hoàn toàn ung thư", "thần dược", "không cần bác sĩ", "vaccine gây"], why: "Chính sách thông tin y tế sai lệch." },
  { area: "Nội dung người lớn", words: ["18+ không che", "nude", "sex video"], why: "Chính sách về nội dung khiêu dâm." },
  { area: "Bản quyền", words: ["reupload", "re-up", "full phim lậu", "xem phim miễn phí bản quyền", "crack"], why: "Rủi ro Content ID / khiếu nại bản quyền, có thể bị gỡ video hoặc gậy." },
];

const CLICKBAIT = ["sốc", "không thể tin", "bị xoá", "bị xóa", "youtube sắp cấm", "lộ clip", "cảnh báo khẩn", "100% ai cũng", "bí mật bị giấu"];
const KIDS_SIGNALS = ["hoạt hình", "cho bé", "mầm non", "thiếu nhi", "bé tập", "kids", "nursery", "toy review"];
const STOPWORDS = new Set(["và", "của", "là", "cho", "với", "trong", "ngoài", "các", "một", "những", "này", "kia", "để", "bị", "được", "khi", "nếu", "thì", "rất", "cùng", "tại", "trên", "dưới", "the", "a", "an", "of", "to", "for", "and", "in", "on", "with", "is", "are", "how", "why"]);

const lower = (value: string) => value.toLowerCase();
const compact = (value: string) => lower(value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d"));

function countMatches(haystack: string, words: string[]) {
  const text = compact(haystack);
  return words.filter((word) => text.includes(compact(word)));
}

export function tagByteLength(tags: string[]) {
  // YouTube tính tổng độ dài tag + dấu phẩy phân tách, giới hạn 500.
  return tags.reduce((sum, tag) => sum + tag.trim().length, 0) + Math.max(tags.length - 1, 0);
}

export function analyzeMetadata(draft: MetadataDraft): PolicyReport {
  const findings: Finding[] = [];
  const title = draft.title.trim();
  const description = draft.description.trim();
  const tags = draft.tags.map((tag) => tag.trim()).filter(Boolean);
  const seconds = draft.durationSeconds;

  // --- Tiêu đề ---
  if (!title) findings.push({ id: "title-required", level: "blocker", area: "Tiêu đề", message: "Chưa có tiêu đề. YouTube bắt buộc tiêu đề từ 1 đến 100 ký tự.", fix: "Đặt tiêu đề chứa từ khóa chính trong 60 ký tự đầu." });
  if (title.length > LIMITS.title) findings.push({ id: "title-max", level: "blocker", area: "Tiêu đề", message: `Tiêu đề ${title.length} ký tự, vượt giới hạn ${LIMITS.title} của YouTube nên sẽ bị từ chối.`, fix: `Cắt còn tối đa ${LIMITS.title} ký tự.` });
  else if (title.length > LIMITS.titleVisible) findings.push({ id: "title-visible", level: "warning", area: "Tiêu đề", message: `Tiêu đề dài ${title.length} ký tự sẽ bị cắt trên di động và kết quả tìm kiếm.`, fix: "Đưa ý chính về 60-70 ký tự đầu." });
  const upper = title.replace(/[^A-Za-zÀ-Ỹ]/g, "");
  if (upper.length > 8 && upper === upper.toUpperCase()) findings.push({ id: "title-caps", level: "warning", area: "Tiêu đề", message: "Tiêu đề viết HOA toàn bộ bị xem là cường điệu, giảm độ tin cậy và CTR bền vững.", fix: "Chỉ hoa 1-2 từ khóa quan trọng." });
  const emojiCount = (title.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || []).length;
  if (emojiCount > 2) findings.push({ id: "title-emoji", level: "warning", area: "Tiêu đề", message: `${emojiCount} emoji trong tiêu đề dễ bị hệ thống xếp hạng coi là spam tiêu đề.`, fix: "Giữ tối đa 1 emoji, đặt cuối tiêu đề." });
  const clickbaitHits = countMatches(title, CLICKBAIT);
  if (clickbaitHits.length) findings.push({ id: "title-clickbait", level: "blocker", area: "Siêu dữ liệu gây hiểu lầm", message: `Tiêu đề chứa cụm từ phóng đại: "${clickbaitHits.join('", "')}". Đây là vi phạm chính sách Spam & hành vi lừa đảo nếu nội dung không đúng như vậy.`, fix: "Mô tả đúng nội dung thật của video." });

  // --- Nội dung bị cấm (quét cả tiêu đề + mô tả + tag) ---
  const corpus = `${title}\n${description}\n${tags.join(" ")}`;
  for (const group of BANNED_GROUPS) {
    const hits = countMatches(corpus, group.words);
    if (hits.length) findings.push({ id: `policy-${group.area.slice(0, 8)}`, level: group.area === "Bản quyền" ? "warning" : "blocker", area: group.area, message: `Phát hiện cụm từ rủi ro: "${hits.join('", "')}". ${group.why}`, fix: "Loại bỏ hoặc diễn đạt lại, kiểm tra nguồn tư liệu trước khi đăng." });
  }

  // --- Mô tả ---
  if (description.length > LIMITS.description) findings.push({ id: "desc-max", level: "blocker", area: "Mô tả", message: `Mô tả ${description.length} ký tự vượt giới hạn ${LIMITS.description}.`, fix: "Rút gọn phần đầu, chuyển chi tiết dài thành chương." });
  else if (description.length < 100) findings.push({ id: "desc-short", level: "warning", area: "Mô tả", message: `Mô tả chỉ ${description.length} ký tự — quá mỏng để YouTube hiểu chủ đề và xếp hạng.`, fix: "Viết 150-300 ký tự đầu tóm tắt nội dung, thêm mốc thời gian và lời kêu gọi." });
  const firstLine = description.slice(0, LIMITS.descriptionVisible);
  if (description && !/[a-zà-ỹ]/i.test(firstLine)) findings.push({ id: "desc-above-fold", level: "warning", area: "Mô tả", message: "150 ký tự đầu không chứa nội dung đọc được — đây là phần hiển thị trước khi bấm 'Thêm'.", fix: "Đưa câu tóm tắt giá trị video lên dòng đầu." });
  const links = description.match(/https?:\/\/\S+/g) || [];
  if (links.length > 6) findings.push({ id: "desc-links", level: "warning", area: "Mô tả", message: `${links.length} liên kết trong mô tả có thể bị gắn cờ spam.`, fix: "Giữ 2-4 liên kết quan trọng, gom phần còn lại vào một trang." });
  if (links.some((link) => /bit\.ly|tinyurl|goo\.gl|t\.me\/\+|shorturl/i.test(link))) findings.push({ id: "desc-shortlink", level: "blocker", area: "Liên kết rút gọn", message: "Link rút gọn/ẩn danh dễ bị YouTube chặn và làm giảm niềm tin người xem.", fix: "Dùng liên kết đầy đủ, rõ nguồn." });
  if (seconds && seconds >= 180 && !/(^|\n)\s*0?0:00/m.test(description)) findings.push({ id: "desc-chapters", level: "tip", area: "Chương video", message: "Video dài hơn 3 phút nhưng chưa có mốc thời gian 00:00 để bật chương.", fix: "Thêm dòng '00:00 Mở đầu' rồi liệt kê các chương cách nhau ≥ 10 giây." });
  if (draft.handle && !compact(description).includes(compact(draft.handle))) findings.push({ id: "desc-handle", level: "tip", area: "Nhận diện kênh", message: `Mô tả chưa nhắc ${draft.handle} — thiếu tín hiệu nhận diện kênh.`, fix: `Thêm "${draft.handle}" và link kênh vào phần giới thiệu.` });

  // --- Tag ---
  const tagUsed = tagByteLength(tags);
  if (tagUsed > LIMITS.tagBytes) findings.push({ id: "tag-max", level: "blocker", area: "Tag", message: `Tổng tag ${tagUsed}/${LIMITS.tagBytes} ký tự — YouTube sẽ từ chối lưu.`, fix: "Bớt tag dài, giữ 8-12 tag sát chủ đề." });
  if (tags.length > LIMITS.tagCount) findings.push({ id: "tag-count", level: "warning", area: "Tag", message: `${tags.length} tag vượt mức khuyến nghị ${LIMITS.tagCount}, dễ bị coi là nhồi nhét từ khóa.`, fix: "Ưu tiên tag mô tả đúng nội dung." });
  const titleTokens = keywordsOf(title, 6);
  if (tags.length && titleTokens.length && !tags.some((tag) => titleTokens.some((token) => compact(tag).includes(token)))) findings.push({ id: "tag-mismatch", level: "warning", area: "Siêu dữ liệu gây hiểu lầm", message: "Không tag nào liên quan đến tiêu đề — siêu dữ liệu không nhất quán là lỗi chính sách phổ biến.", fix: "Đưa từ khóa chính của tiêu đề vào 3 tag đầu." });
  if (!tags.length) findings.push({ id: "tag-empty", level: "tip", area: "Tag", message: "Chưa có tag nào. Tag giúp YouTube hiểu ngữ cảnh, đặc biệt với từ khoá dễ nhầm.", fix: "Thêm tên kênh, handle, chủ đề chính và 2 biến thể tìm kiếm." });

  // --- Thumbnail ---
  const thumb = draft.thumbnail;
  if (!thumb) findings.push({ id: "thumb-missing", level: draft.kind === "image" ? "tip" : "warning", area: "Ảnh thu nhỏ", message: "Chưa có thumbnail tùy chỉnh — video sẽ bị YouTube tự cắt khung hình ngẫu nhiên.", fix: "Tạo ảnh 1280x720 (16:9), dung lượng dưới 2MB trong trình sửa ảnh." });
  else {
    if (thumb.bytes > LIMITS.thumbBytes) findings.push({ id: "thumb-size", level: "blocker", area: "Ảnh thu nhỏ", message: `Thumbnail ${(thumb.bytes / 1024 / 1024).toFixed(2)}MB vượt giới hạn 2MB của YouTube.`, fix: "Giảm chất lượng JPEG xuống 80-85% hoặc xuất 1280x720." });
    const ratio = thumb.width / thumb.height;
    if (draft.kind === "short") {
      if (ratio > 0.8) findings.push({ id: "thumb-short-ratio", level: "warning", area: "Ảnh thu nhỏ Shorts", message: `Shorts nên dùng khung dọc 9:16 (1080x1920); ảnh hiện tại ${thumb.width}x${thumb.height}.`, fix: "Cắt 9:16 trong trình sửa ảnh." });
    } else if (Math.abs(ratio - 16 / 9) > 0.02) findings.push({ id: "thumb-ratio", level: "blocker", area: "Ảnh thu nhỏ", message: `Tỉ lệ ${thumb.width}x${thumb.height} không phải 16:9 — YouTube yêu cầu 1280x720.`, fix: "Cắt về 1280x720." });
    if (thumb.width < 640) findings.push({ id: "thumb-width", level: "warning", area: "Ảnh thu nhỏ", message: `Chiều rộng ${thumb.width}px dưới mức tối thiểu 640px, ảnh sẽ mờ trên TV.`, fix: "Xuất tối thiểu 1280px chiều rộng." });
  }

  // --- Định dạng & thời lượng ---
  if (draft.kind === "short") {
    if (seconds && seconds > LIMITS.shortSeconds) findings.push({ id: "short-duration", level: "blocker", area: "Shorts", message: `Thời lượng ${Math.round(seconds)}s vượt ${LIMITS.shortSeconds}s nên YouTube xếp thành video thường, mất phân phối Shorts.`, fix: "Cắt còn dưới 180 giây (tối ưu 15-45 giây)." });
    if (!compact(`${title} ${description}`).includes("#shorts")) findings.push({ id: "short-hashtag", level: "tip", area: "Shorts", message: "Chưa có #Shorts trong tiêu đề/mô tả.", fix: "Thêm #Shorts để hệ thống nhận diện nhanh hơn." });
  }
  if (draft.kind === "live" && !seconds) findings.push({ id: "live-schedule", level: "tip", area: "Phát trực tiếp", message: "Chưa đặt lịch phát — livestream nên lên lịch trước 24-48 giờ để nhận thông báo.", fix: "Chọn ngày giờ phát và bật nhắc nhở." });
  if (seconds && seconds < 30 && draft.kind === "video") findings.push({ id: "video-too-short", level: "warning", area: "Thời lượng", message: `Video ${Math.round(seconds)}s rất khó giữ thời gian xem — nên chuyển thành Shorts.`, fix: "Đổi định dạng sang Shorts hoặc ghép thêm nội dung." });

  // --- Trẻ em (COPPA) ---
  const kidsHits = countMatches(corpus, KIDS_SIGNALS);
  if (kidsHits.length && !draft.madeForKids) findings.push({ id: "coppa-missing", level: "blocker", area: "COPPA / Nội dung trẻ em", message: `Nội dung có dấu hiệu hướng tới trẻ em ("${kidsHits.join(", ")}") nhưng chưa khai báo. Khai sai bị phạt theo COPPA và có thể khoá kênh.`, fix: "Bật 'Có, video này dành cho trẻ em' nếu đúng, hoặc bỏ yếu tố trẻ em khỏi nội dung." });
  if (draft.madeForKids) findings.push({ id: "coppa-on", level: "warning", area: "COPPA / Nội dung trẻ em", message: "Đã khai báo dành cho trẻ em: bình luận, thông báo, quảng cáo cá nhân hoá, màn hình kết thúc và thẻ đều bị tắt → doanh thu thấp hơn.", fix: "Chỉ bật nếu nội dung thực sự nhắm tới trẻ em." });

  // --- Quảng cáo & tài trợ ---
  if (draft.paidPromotion && !/(quảng cáo|tài trợ|được trả|#ad|#quangcao|paid promotion)/i.test(description)) findings.push({ id: "paid-disclosure", level: "blocker", area: "Công bố quảng cáo", message: "Đã đánh dấu có nội dung trả phí nhưng mô tả thiếu dòng công bố. Bắt buộc theo chính sách YouTube và Luật Quảng cáo Việt Nam.", fix: "Thêm 'Video có chứa nội dung quảng cáo được trả phí' vào đầu mô tả." });
  if (!draft.paidPromotion && /(nhận tài trợ|được trả tiền|hợp tác thương hiệu|booking)/i.test(description)) findings.push({ id: "paid-mismatch", level: "warning", area: "Công bố quảng cáo", message: "Mô tả nhắc tới tài trợ nhưng chưa bật cờ nội dung trả phí.", fix: "Bật 'Video có chứa nội dung được trả phí để quảng cáo'." });

  // --- Phân loại & khả năng tiếp cận ---
  if (!draft.categoryId) findings.push({ id: "category-missing", level: "warning", area: "Danh mục", message: "Chưa chọn danh mục video — giảm khả năng được gợi ý theo chủ đề.", fix: "Chọn danh mục khớp nội dung (Howto & Style, Education, Entertainment…)." });
  if (!draft.hasCaptions) findings.push({ id: "captions-missing", level: "tip", area: "Phụ đề", message: "Chưa có phụ đề. Phụ đề tiếng Việt + tiếng Anh tăng thời gian xem và khả năng tiếp cận.", fix: "Tải phụ đề .srt hoặc bật phụ đề tự động rồi hiệu đính." });
  if (draft.language && !/^vi/i.test(draft.language)) findings.push({ id: "language-mismatch", level: "tip", area: "Ngôn ngữ", message: `Ngôn ngữ khai báo là ${draft.language} trong khi nội dung hướng tới khán giả Việt.`, fix: "Đặt ngôn ngữ video là Tiếng Việt." });
  if (draft.privacyStatus === "unlisted") findings.push({ id: "privacy-unlisted", level: "tip", area: "Chế độ hiển thị", message: "Không công khai: video không xuất hiện trong tìm kiếm/đề xuất, không tích luỹ lượt xem.", fix: "Đặt Công khai hoặc Lên lịch khi đã sẵn sàng." });

  const score = Math.max(0, 100 - findings.reduce((sum, f) => sum + (f.level === "blocker" ? 18 : f.level === "warning" ? 7 : 2), 0));
  const grade = score >= 92 ? "A+" : score >= 82 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : "D";
  const blockers = findings.filter((f) => f.level === "blocker");
  const checklist: ChecklistItem[] = [
    { id: "c-title", label: `Tiêu đề ≤ ${LIMITS.title} ký tự, không phóng đại`, state: !title || title.length > LIMITS.title || clickbaitHits.length ? "fail" : "pass", detail: `${title.length}/${LIMITS.title}` },
    { id: "c-desc", label: `Mô tả 100-${LIMITS.description} ký tự, có tóm tắt đầu trang`, state: description.length > LIMITS.description ? "fail" : description.length >= 100 ? "pass" : "todo", detail: `${description.length} ký tự` },
    { id: "c-tags", label: `Tổng tag ≤ ${LIMITS.tagBytes} ký tự`, state: tagUsed > LIMITS.tagBytes ? "fail" : tags.length ? "pass" : "todo", detail: `${tagUsed}/${LIMITS.tagBytes}` },
    { id: "c-thumb", label: "Thumbnail 1280x720, dưới 2MB", state: !thumb ? "todo" : thumb.bytes > LIMITS.thumbBytes ? "fail" : draft.kind === "short" ? "pass" : Math.abs(thumb.width / thumb.height - 16 / 9) <= 0.02 ? "pass" : "fail", detail: thumb ? `${thumb.width}x${thumb.height} · ${(thumb.bytes / 1024).toFixed(0)}KB` : undefined },
    { id: "c-policy", label: "Không chạm Nguyên tắc cộng đồng", state: blockers.some((b) => b.area !== "Tiêu đề") ? "fail" : "pass" },
    { id: "c-coppa", label: "Khai báo đúng nội dung trẻ em (COPPA)", state: kidsHits.length && !draft.madeForKids ? "fail" : "pass" },
    { id: "c-paid", label: "Công bố nội dung trả phí/tài trợ", state: draft.paidPromotion && findings.some((f) => f.id === "paid-disclosure") ? "fail" : "pass" },
    { id: "c-format", label: "Đúng định dạng & thời lượng", state: findings.some((f) => ["short-duration", "video-too-short"].includes(f.id)) ? "fail" : seconds ? "pass" : "todo", detail: seconds ? `${Math.round(seconds)}s` : undefined },
    { id: "c-category", label: "Đã chọn danh mục & ngôn ngữ", state: draft.categoryId ? "pass" : "todo" },
    { id: "c-captions", label: "Có phụ đề để tăng tiếp cận", state: draft.hasCaptions ? "pass" : "todo" },
  ];

  return {
    score,
    grade,
    readyToPublish: blockers.length === 0,
    findings,
    blockers,
    warnings: findings.filter((f) => f.level === "warning"),
    tips: findings.filter((f) => f.level === "tip"),
    checklist,
    tagBudget: { used: tagUsed, limit: LIMITS.tagBytes },
  };
}

/** Tách từ khoá có nghĩa, bỏ stopword tiếng Việt/Anh. */
export function keywordsOf(text: string, limit = 8): string[] {
  const tokens = compact(text)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
  const counted = new Map<string, number>();
  for (const token of tokens) counted.set(token, (counted.get(token) ?? 0) + 1);
  return [...counted.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).slice(0, limit).map(([token]) => token);
}

export interface AssistantPlan {
  titles: string[];
  description: string;
  tags: string[];
  hashtags: string[];
  chapters: { time: string; label: string }[];
  hooks: string[];
  thumbnailBrief: string[];
  publishWindows: string[];
  notes: string;
}

function clockOf(totalSeconds: number, ratio: number) {
  const value = Math.max(0, Math.round(totalSeconds * ratio));
  const mm = String(Math.floor(value / 60)).padStart(2, "0");
  const ss = String(value % 60).padStart(2, "0");
  return totalSeconds >= 3600 ? `00:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Trợ lý nội dung: sinh tiêu đề, mô tả, tag, chương, kịch bản mở đầu và ghi chú đẩy sang YouTube Studio. */
export function buildAssistant(draft: MetadataDraft, report: PolicyReport, channelTitle: string): AssistantPlan {
  const topic = draft.title.trim() || keywordsOf(draft.description, 4).join(" ") || "chủ đề mới";
  const keys = keywordsOf(`${topic} ${draft.description}`, 5);
  const main = keys[0] ?? "video";
  const handle = draft.handle || "@HangulMinh";
  const seconds = draft.durationSeconds ?? (draft.kind === "short" ? 45 : 480);

  const titles = [
    `${topic.slice(0, 58)}`,
    `Cách ${main} từ A-Z cho người mới (${clockOf(seconds, 1)} thực chiến)`,
    `${keys.slice(0, 3).map((k) => k[0]?.toUpperCase() + k.slice(1)).join(" ")}: 5 điều mình ước biết sớm hơn`,
    `Tại sao ${main} không hiệu quả? Đây là lỗi 90% người mới mắc`,
    draft.kind === "short" ? `${topic.slice(0, 42)} #Shorts` : `${topic.slice(0, 52)} | ${channelTitle}`,
  ].map((line) => line.replace(/\s+/g, " ").trim().slice(0, LIMITS.title));

  const chapters = draft.kind === "short" ? [] : [
    { time: "00:00", label: "Mở đầu & lời hứa của video" },
    { time: clockOf(seconds, 0.08), label: `Vì sao ${main} quan trọng` },
    { time: clockOf(seconds, 0.28), label: "Chuẩn bị cần thiết" },
    { time: clockOf(seconds, 0.45), label: "Thực hiện từng bước" },
    { time: clockOf(seconds, 0.72), label: "Lỗi thường gặp và cách tránh" },
    { time: clockOf(seconds, 0.9), label: "Kết quả & bước tiếp theo" },
  ];

  const description = [
    `${topic}. Trong video này mình chia sẻ trọn quy trình ${main} kèm ví dụ thực tế để bạn áp dụng được ngay.`,
    "",
    ...(chapters.length ? ["⏱ MỐC THỜI GIAN", ...chapters.map((c) => `${c.time} ${c.label}`), ""] : []),
    `📌 Kênh: ${channelTitle} (${handle})`,
    draft.paidPromotion ? "⚠️ Video có chứa nội dung quảng cáo được trả phí." : "",
    "",
    `#${main.replace(/\s+/g, "")} #YouTubeVietnam ${draft.kind === "short" ? "#Shorts" : ""}`.trim(),
  ].filter((line, index, all) => line !== "" || all[index - 1] !== "").join("\n").slice(0, LIMITS.description);

  const tags = [topic, main, ...keys, channelTitle, handle, `${main} cho người mới`, `hướng dẫn ${main}`, "youtube việt nam"]
    .map((tag) => tag.trim().slice(0, 40))
    .filter(Boolean)
    .filter((tag, index, all) => all.indexOf(tag) === index);
  const packed: string[] = [];
  let used = 0;
  for (const tag of tags) {
    if (used + tag.length + (packed.length ? 1 : 0) > LIMITS.tagBytes - 20) break;
    packed.push(tag);
    used += tag.length + (packed.length > 1 ? 1 : 0);
  }

  const hooks = [
    `3 giây đầu: "${topic.slice(0, 48)}" — hiện ngay kết quả cuối video để giữ người xem.`,
    `Đặt câu hỏi: "Bạn đã từng ${main} mà không ra kết quả?" rồi hứa giải quyết trong video.`,
    `Mở bằng cảnh hậu trường/sai hỏng thật, sau đó nói: "Đây là cách mình sửa nó."`,
    draft.kind === "short" ? "Shorts: vào thẳng hành động, không intro, phụ đề to ở 1/3 giữa khung hình." : "Video dài: tóm tắt 3 ý sẽ học được trong 20 giây đầu.",
  ];

  const thumbnailBrief = [
    "Kích thước 1280x720 (16:9), dưới 2MB, xuất JPEG chất lượng 85%.",
    draft.kind === "short" ? "Shorts dùng khung dọc 1080x1920; chừa 15% đáy cho tên kênh và UI." : "Chừa góc dưới phải cho logo kênh, tránh bị UI che.",
    "Tối đa 4-5 từ trên ảnh, chữ dày có viền, tương phản mạnh với nền.",
    "Một khuôn mặt biểu cảm rõ hoặc vật thể chính chiếm ≥ 40% khung hình.",
    "Không dùng hình ảnh máu me, sốc, gợi dục hoặc phóng đại kết quả — vi phạm Nguyên tắc cộng đồng.",
  ];

  const publishWindows = [
    "Ngày thường: 11h30-13h00 hoặc 19h00-21h00 (giờ Việt Nam) — khung xem cao điểm.",
    "Cuối tuần: 09h00-11h00, đăng trước 2 giờ so với giờ cao điểm để YouTube xử lý HD + kiểm tra bản quyền.",
    "Shorts: 12h00 và 20h30; giữ nhịp 3-5 Shorts/tuần để thuật toán có tín hiệu ổn định.",
    "Luôn lên lịch (Schedule) thay vì Public ngay: có thời gian sửa metadata trong 30 phút đầu.",
  ];

  const fixList = [...report.blockers, ...report.warnings].slice(0, 8);
  const notes = [
    `GHI CHÚ ĐẨY SANG YOUTUBE STUDIO — ${new Date().toLocaleString("vi-VN")}`,
    `Kênh: ${channelTitle} (${handle})`,
    `Định dạng: ${draft.kind} · Thời lượng: ${Math.round(seconds)}s · Hiển thị: ${draft.privacyStatus}`,
    `Điểm tuân thủ: ${report.score}/100 (${report.grade}) — ${report.readyToPublish ? "sẵn sàng đăng" : "CHƯA đạt, cần xử lý lỗi chặn"}`,
    "",
    fixList.length ? "Việc cần làm trước khi đăng:" : "Không có lỗi nào phát hiện.",
    ...fixList.map((f, i) => `${i + 1}. [${f.area}] ${f.message}${f.fix ? ` → ${f.fix}` : ""}`),
    "",
    "Tiêu đề nên dùng:",
    ...titles.slice(0, 3).map((t, i) => `  ${i + 1}. ${t}`),
    "",
    `Tag đã tối ưu ${LIMITS.tagBytes} ký tự: ${packed.join(", ")}`,
    "Sau khi đăng: ghim bình luận hỏi đáp, thêm thẻ/màn hình kết thúc (nếu không phải nội dung trẻ em), kiểm tra khiếu nại bản quyền trong 24h.",
  ].join("\n");

  return { titles, description, tags: packed, hashtags: [`#${main.replace(/\s+/g, "")}`, "#YouTubeVietnam", draft.kind === "short" ? "#Shorts" : "#VideoMoi"], chapters, hooks, thumbnailBrief, publishWindows, notes };
}
