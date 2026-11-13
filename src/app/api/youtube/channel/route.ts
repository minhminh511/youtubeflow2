import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_HANDLE = "@HangulMinh";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export interface PublicVideo {
  videoId: string;
  title: string;
  thumbnail: string | null;
  duration: string | null;
  views: string | null;
  published: string | null;
  url: string;
}

export interface PublicChannel {
  handle: string;
  channelId: string | null;
  title: string;
  thumbnail: string | null;
  subscribers: string | null;
  videoCount: string | null;
  views: string | null;
  description: string | null;
  url: string;
  videos: PublicVideo[];
}

function decodeEntities(value: string) {
  return value
    .replace(/\\u0026/g, "&")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, " ")
    .replace(/\\"/g, '"')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function firstMatch(html: string, patterns: string[]): string | null {
  for (const pattern of patterns) {
    const found = new RegExp(pattern).exec(html);
    if (found?.[1]) return decodeEntities(found[1].trim());
  }
  return null;
}

function normalizeHandle(raw: string | null) {
  const value = (raw || DEFAULT_HANDLE).trim();
  const withAt = value.startsWith("@") ? value : `@${value.replace(/^https?:\/\/(www\.)?youtube\.com\/@?/, "")}`;
  return /^@[\w.\-]{2,40}$/.test(withAt) ? withAt : DEFAULT_HANDLE;
}

/** Đọc số kiểu Việt: "1,2 N người đăng ký" / "3.456" / "1,5 Tr". */
function normalizeCount(raw: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\s*(người đăng ký|người theo dõi|subscriber[s]?|lượt xem|view[s]?|video)\s*/gi, " ").trim();
  const unit = cleaned.replace(/[\d.,\s]/g, "");
  const multiplier = /^(N|ngàn|nghìn|K)$/i.test(unit) ? 1_000 : /^(Tr|triệu|M)$/i.test(unit) ? 1_000_000 : 1;
  const number = Number(cleaned.replace(/[^\d.,]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
  if (!Number.isFinite(number) || number <= 0) return raw.trim();
  return String(Math.round(number * multiplier));
}

async function fetchPage(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(18000),
    headers: {
      "User-Agent": USER_AGENT,
      "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!response.ok) throw new Error(`youtube_http_${response.status}`);
  return response.text();
}

const UI_LABELS = new Set([
  "Thêm vào danh sách chờ", "Chia sẻ", "Tải xuống", "Xem sau", "Phát", "Đăng ký", "Tìm kiếm",
  "Trang chủ", "Video", "Shorts", "Trực tiếp", "Danh sách phát", "Cộng đồng", "Giới thiệu",
]);

/**
 * Quét videoId/contentId rồi đọc thông tin trong cửa sổ ngữ cảnh quanh nó.
 * Cách này không phụ thuộc tên renderer (YouTube đổi videoRenderer -> lockupViewModel).
 */
function parseVideos(html: string, limit = 24): PublicVideo[] {
  const videos: PublicVideo[] = [];
  const seen = new Set<string>();
  const scan = /"(?:videoId|contentId)":"([\w-]{11})"/g;
  let match: RegExpExecArray | null = scan.exec(html);
  while (match !== null) {
    const id = match[1];
    const at = match.index;
    match = scan.exec(html);
    if (seen.has(id)) continue;
    const scope = html.slice(Math.max(0, at - 1000), at + 1600);
    const pick = (patterns: string[]): string | null => {
      for (const pattern of patterns) {
        const found = new RegExp(pattern).exec(scope);
        if (found?.[1]) {
          const value = decodeEntities(found[1].trim());
          if (!UI_LABELS.has(value)) return value;
        }
      }
      return null;
    };
    const title = pick([
      `"title":\\{"runs":\\[\\{"text":"([^"]{4,200})"`,
      `"title":\\{"content":"([^"]{4,200})"`,
      `"headline":\\{"content":"([^"]{4,200})"`,
      `"accessibilityText":"([^"]{4,160}?) - [^"]{0,40}(?:lượt xem|views)`,
      `"text":"([^"]{6,160})","accessibilityText"`,
    ]);
    const duration = pick([
      `"lengthText":\\{[^{}]*?"simpleText":"([^"]{1,20})"`,
      `"badgeText":"([0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?)"`,
      `"text":"([0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?)"`,
    ]);
    const views = pick([
      `"viewCountText":\\{"simpleText":"([^"]{1,40})"`,
      `"viewCountText":\\{"runs":\\[\\{"text":"([^"]{1,40})"`,
      `([\\d.,]+\\s*(?:N|K|M)?\\s*lượt xem)`,
    ]);
    const published = pick([
      `"publishedTimeText":\\{"simpleText":"([^"]{1,40})"`,
      `([0-9]+\\s*(?:phút|giờ|ngày|tuần|tháng|năm) trước)`,
    ]);
    const thumbnail = pick([
      `"thumbnail":\\{"thumbnails":\\[\\{"url":"([^"]+)"`,
      `"sources":\\[\\{"url":"([^"]+)"`,
    ]);
    seen.add(id);
    videos.push({
      videoId: id,
      title: title || `Video ${id}`,
      thumbnail: thumbnail ? thumbnail.replace(/\\u0026/g, "&") : null,
      duration,
      views: views ? views.replace(/\s*lượt xem.*/i, "") : null,
      published,
      url: `https://www.youtube.com/watch?v=${id}`,
    });
    if (videos.length >= limit) break;
  }
  return videos;
}

function parseChannel(html: string, handle: string): PublicChannel {
  const channelId = firstMatch(html, [`"externalId":"(UC[^"]+)"`, `"browseId":"(UC[^"]+)"`, `itemprop="identifier" content="(UC[^"]+)"`, `youtube\\.com/channel/(UC[^"]+)`]);
  const title =
    firstMatch(html, [`<meta property="og:title" content="([^"]*)"`, `"title":"([^"]{1,120})","navigationEndpoint"`, `<title>([^<]{1,120})</title>`]) || handle;
  const thumbnail = firstMatch(html, [`<meta property="og:image" content="([^"]*)"`, `"avatar":\\{"thumbnails":\\[\\{"url":"([^"]+)"`]);
  const description = firstMatch(html, [`<meta property="og:description" content="([^"]*)"`, `"description":"([^"]{1,500})"`]);
  const subscribers = normalizeCount(
    firstMatch(html, [
      `"subscriberCountText":\\{"accessibility[^}]*\\},"simpleText":"([^"]{1,60})"`,
      `"subscriberCountText":\\{"simpleText":"([^"]{1,60})"`,
      `([\\d.,]+\\s*(?:N|ngàn|nghìn|K|Tr|triệu|M)?\\s*người đăng ký)`,
    ]),
  );
  const videoCount = normalizeCount(
    firstMatch(html, [`"videoCountText":\\{"runs":\\[\\{"text":"([^"]{1,40})"`, `"content":"([\\d.,]+\\s*(?:N|K|M)?\\s*video)"`, `([\\d.,]+\\s*(?:N|K|M)?\\s+video)`]),
  );
  const views = normalizeCount(firstMatch(html, [`"viewCountText":\\{"simpleText":"([^"]{1,60})"`, `"viewCountText":\\{"runs":\\[\\{"text":"([^"]{1,60})"`]));
  return { handle, channelId, title, thumbnail, subscribers, videoCount, views, description, url: `https://www.youtube.com/${handle}`, videos: [] };
}

/**
 * Đồng bộ dữ liệu công khai của một kênh YouTube theo handle.
 * Không cần Google OAuth: đọc trang kênh + tab /videos. Khi workspace đã kết nối
 * OAuth, dữ liệu trong `youtube_connections` vẫn là nguồn ưu tiên ở phía client.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const handle = normalizeHandle(searchParams.get("handle"));
  const withVideos = searchParams.get("videos") !== "0";

  try {
    const html = await fetchPage(`https://www.youtube.com/${handle}`);
    const channel = parseChannel(html, handle);
    if (!channel.channelId && channel.title === handle) {
      return NextResponse.json({ ok: false, error: `Không tìm thấy kênh ${handle} ở chế độ công khai.` }, { status: 404 });
    }
    if (withVideos) {
      for (const tab of ["videos", "shorts", "streams"]) {
        try {
          const found = parseVideos(await fetchPage(`https://www.youtube.com/${handle}/${tab}`));
          if (found.length) { channel.videos = found; break; }
        } catch { /* thử tab kế tiếp */ }
      }
    }
    return NextResponse.json(
      { ok: true, source: "public", channel, fetchedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "unknown";
    const status = code.startsWith("youtube_http_") ? 502 : 504;
    const message = code === "youtube_http_404"
      ? `YouTube trả về 404 cho ${handle}. Kiểm tra lại handle kênh.`
      : code === "The operation was aborted due to timeout"
        ? "Hết thời gian chờ khi gọi YouTube. Thử lại sau vài giây."
        : "Không đọc được dữ liệu công khai của kênh từ máy chủ này.";
    return NextResponse.json({ ok: false, error: message, code }, { status });
  }
}
