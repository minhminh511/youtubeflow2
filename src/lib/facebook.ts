import "server-only";
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { facebookConnections, facebookEarnings, facebookPosts } from "@/db/schema";
import { decrypt, encrypt, safeEqual } from "@/lib/security";
import { apiError } from "@/lib/workspace";
import type { FbKind } from "@/lib/facebook-policy";

export const FB_COOKIE = "tubeflow_facebook_oauth";
export const FB_SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "pages_manage_engagement", "read_insights", "business_management"];
const REQUIRED_SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_posts"];
export const GRAPH_VERSION = process.env.META_GRAPH_VERSION?.trim() || "v25.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
const RUPLOAD = `https://rupload.facebook.com/video-upload/${GRAPH_VERSION}`;
const EARNINGS_METRICS = ["content_monetization_earnings", "monetization_approximate_earnings"];

export interface FacebookPageSummary {
  id: string;
  name: string;
  picture: string | null;
  category: string | null;
  fanCount: number;
  followers: number;
  tasks: string[];
}
interface StoredPage { id: string; name: string; token: string }
interface StoredTokens { userToken: string; expiresAt: number; pages: StoredPage[] }

export class GraphError extends Error {
  constructor(message: string, public readonly code: number | null, public readonly status: number) {
    super(message);
  }
}

export function facebookConfig() {
  const appId = process.env.FACEBOOK_APP_ID?.trim() || "";
  const appSecret = process.env.FACEBOOK_APP_SECRET?.trim() || "";
  const appUrl = (process.env.APP_URL?.trim() || "http://localhost:3000").replace(/\/$/, "");
  return {
    appId,
    appUrl,
    redirectUri: `${appUrl}/api/facebook/callback`,
    ready: /^\d{8,20}$/.test(appId) && appSecret.length >= 16,
    secure: appUrl.startsWith("https://"),
  };
}

export function randomState() {
  return randomBytes(24).toString("base64url");
}

export function oauthDialogUrl(state: string) {
  const config = facebookConfig();
  const url = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  url.search = new URLSearchParams({
    client_id: config.appId,
    redirect_uri: config.redirectUri,
    state,
    scope: FB_SCOPES.join(","),
    response_type: "code",
  }).toString();
  return url.toString();
}

/** Minimal Graph client. Errors carry Meta's code so routes can give actionable Vietnamese messages. */
async function graph<T>(path: string, token: string | null, options: { method?: "GET" | "POST" | "DELETE"; params?: Record<string, string>; form?: FormData; timeoutMs?: number } = {}): Promise<T> {
  const { method = "GET", params = {}, form, timeoutMs = 30000 } = options;
  const search = new URLSearchParams(params);
  if (token) search.set("access_token", token);
  let url = `${GRAPH}/${path.replace(/^\/+/, "")}`;
  const init: RequestInit = { method, cache: "no-store", signal: AbortSignal.timeout(timeoutMs) };
  if (form) {
    for (const [key, value] of search) form.append(key, value);
    init.body = form;
  } else if (method === "POST") {
    init.headers = { "Content-Type": "application/x-www-form-urlencoded" };
    init.body = search.toString();
  } else {
    url += `?${search.toString()}`;
  }
  const response = await fetch(url, init);
  const data = (await response.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number } };
  if (!response.ok || data.error) {
    throw new GraphError(data.error?.message || `HTTP ${response.status}`, data.error?.code ?? null, response.status);
  }
  return data as T;
}

export function facebookErrorResponse(error: unknown) {
  if (error instanceof GraphError) {
    if ([190, 102, 463, 467].includes(error.code ?? -1)) return NextResponse.json({ error: "Kết nối Facebook đã hết hạn hoặc bị thu hồi. Hãy kết nối lại Trang.", code: "reconnect" }, { status: 401 });
    if ([10, 200, 294, 2500].includes(error.code ?? -1)) return NextResponse.json({ error: "Facebook chưa cấp đủ quyền cho thao tác này. Kiểm tra quyền của ứng dụng và vai trò Quản trị viên/Biên tập viên trên Trang.", code: "permission" }, { status: 403 });
    if (error.code === 368) return NextResponse.json({ error: "Facebook tạm chặn thao tác này vì hoạt động bất thường. Hãy thử lại sau ít giờ.", code: "rate_limited" }, { status: 429 });
    return NextResponse.json({ error: `Facebook từ chối yêu cầu: ${error.message}`, code: "facebook_api" }, { status: 502 });
  }
  const code = error instanceof Error ? error.message : "";
  if (code === "fb_missing_config") return NextResponse.json({ error: "Chưa cấu hình FACEBOOK_APP_ID và FACEBOOK_APP_SECRET trên máy chủ.", code }, { status: 503 });
  if (code === "fb_not_connected") return NextResponse.json({ error: "Bạn chưa kết nối Trang Facebook.", code }, { status: 409 });
  if (code === "fb_no_page") return NextResponse.json({ error: "Chưa chọn Trang Facebook để làm việc.", code }, { status: 409 });
  if (code === "fb_no_publish_rights") return NextResponse.json({ error: "Tài khoản của bạn chưa có quyền tạo nội dung trên Trang này (cần vai trò Quản trị viên hoặc Biên tập viên).", code }, { status: 403 });
  if (code === "fb_media_required") return NextResponse.json({ error: "Hãy chọn tệp ảnh hoặc video cho loại nội dung này.", code }, { status: 400 });
  return apiError(error);
}

export async function getFacebookConnection(workspaceId: string) {
  const [row] = await db.select().from(facebookConnections).where(eq(facebookConnections.workspaceId, workspaceId)).limit(1);
  return row || null;
}

function storedTokens(row: typeof facebookConnections.$inferSelect): StoredTokens {
  let tokens: StoredTokens;
  try { tokens = decrypt<StoredTokens>(row.encryptedTokens); } catch { throw new GraphError("Token lưu trữ không đọc được.", 190, 401); }
  if (tokens.expiresAt && tokens.expiresAt < Date.now()) throw new GraphError("Token đã hết hạn.", 190, 401);
  return tokens;
}

/** Credentials for the active Page. Tokens never leave the server. */
export async function activeCredentials(workspaceId: string) {
  const row = await getFacebookConnection(workspaceId);
  if (!row) throw new Error("fb_not_connected");
  if (!row.activePageId) throw new Error("fb_no_page");
  const tokens = storedTokens(row);
  const stored = tokens.pages.find((page) => page.id === row.activePageId);
  const summary = row.pages.find((page) => page.id === row.activePageId);
  if (!stored || !summary) throw new Error("fb_no_page");
  return {
    pageId: stored.id,
    pageName: stored.name,
    token: stored.token,
    tasks: summary.tasks,
    canPublish: summary.tasks.includes("CREATE_CONTENT") || summary.tasks.includes("MANAGE"),
    canAnalyze: summary.tasks.includes("ANALYZE") || summary.tasks.includes("MANAGE") || summary.tasks.includes("CREATE_CONTENT"),
  };
}

export async function statusFor(workspaceId: string) {
  const config = facebookConfig();
  const row = await getFacebookConnection(workspaceId);
  if (!row) return { configured: config.ready, redirectUri: config.redirectUri, connected: false, user: null, pages: [], activePageId: null, grantedScopes: [], missingScopes: REQUIRED_SCOPES, reconnectRequired: false, earningsSyncedAt: null };
  let reconnectRequired = false;
  try { storedTokens(row); } catch { reconnectRequired = true; }
  const missingScopes = REQUIRED_SCOPES.filter((scope) => !row.grantedScopes.includes(scope));
  return {
    configured: config.ready,
    redirectUri: config.redirectUri,
    connected: true,
    user: { id: row.userId, name: row.userName },
    pages: row.pages,
    activePageId: row.activePageId,
    grantedScopes: row.grantedScopes,
    missingScopes,
    reconnectRequired,
    earningsSyncedAt: row.earningsSyncedAt?.toISOString() ?? null,
    tokenExpiresAt: row.tokenExpiresAt?.toISOString() ?? null,
  };
}

/** Full OAuth exchange: short-lived code -> long-lived user token -> Page tokens from /me/accounts. */
export async function completeConnection(workspaceId: string, code: string) {
  const config = facebookConfig();
  if (!config.ready) throw new Error("fb_missing_config");
  const shortLived = await graph<{ access_token: string }>("oauth/access_token", null, {
    params: { client_id: config.appId, client_secret: process.env.FACEBOOK_APP_SECRET!.trim(), redirect_uri: config.redirectUri, code },
  });
  const longLived = await graph<{ access_token: string; expires_in?: number }>("oauth/access_token", null, {
    params: { grant_type: "fb_exchange_token", client_id: config.appId, client_secret: process.env.FACEBOOK_APP_SECRET!.trim(), fb_exchange_token: shortLived.access_token },
  });
  const me = await graph<{ id: string; name: string }>("me", longLived.access_token, { params: { fields: "id,name" } });
  const permissions = await graph<{ data: { permission: string; status: string }[] }>("me/permissions", longLived.access_token);
  const grantedScopes = permissions.data.filter((item) => item.status === "granted").map((item) => item.permission);
  const accounts = await graph<{ data: { id: string; name: string; access_token: string; category?: string; fan_count?: number; followers_count?: number; tasks?: string[]; picture?: { data?: { url?: string } } }[] }>(
    "me/accounts",
    longLived.access_token,
    { params: { fields: "id,name,access_token,category,fan_count,followers_count,tasks,picture{url}", limit: "100" } },
  );
  const pages: FacebookPageSummary[] = accounts.data.map((page) => ({
    id: page.id,
    name: page.name,
    picture: page.picture?.data?.url ?? null,
    category: page.category ?? null,
    fanCount: page.fan_count ?? 0,
    followers: page.followers_count ?? 0,
    tasks: page.tasks ?? [],
  }));
  const tokens: StoredTokens = {
    userToken: longLived.access_token,
    expiresAt: Date.now() + (longLived.expires_in ?? 5184000) * 1000,
    pages: accounts.data.map((page) => ({ id: page.id, name: page.name, token: page.access_token })),
  };
  const existing = await getFacebookConnection(workspaceId);
  const activePageId = existing?.activePageId && pages.some((page) => page.id === existing.activePageId) ? existing.activePageId : pages[0]?.id ?? null;
  const values = {
    userId: me.id,
    userName: me.name,
    encryptedTokens: encrypt(tokens),
    pages,
    activePageId,
    grantedScopes,
    tokenExpiresAt: new Date(tokens.expiresAt),
    updatedAt: new Date(),
  };
  await db.insert(facebookConnections).values({ workspaceId, ...values }).onConflictDoUpdate({ target: facebookConnections.workspaceId, set: values });
  return { missingScopes: REQUIRED_SCOPES.filter((scope) => !grantedScopes.includes(scope)), pageCount: pages.length };
}

export async function setActivePage(workspaceId: string, pageId: string) {
  const row = await getFacebookConnection(workspaceId);
  if (!row) throw new Error("fb_not_connected");
  if (!row.pages.some((page) => page.id === pageId)) throw new Error("fb_no_page");
  await db.update(facebookConnections).set({ activePageId: pageId, updatedAt: new Date() }).where(eq(facebookConnections.workspaceId, workspaceId));
}

export async function disconnectFacebook(workspaceId: string) {
  await db.delete(facebookConnections).where(eq(facebookConnections.workspaceId, workspaceId));
}

export function verifyState(cookieValue: string | undefined, state: string | null) {
  return Boolean(cookieValue && state && safeEqual(cookieValue, state));
}

export interface PublishInput {
  pageId: string;
  token: string;
  kind: FbKind;
  message: string;
  file: File | null;
  scheduledUnix: number | null;
}

/** Publishes or schedules to a Page. Scheduling uses Meta's own scheduler, so the time is enforced by Facebook. */
export async function publishToPage(input: PublishInput): Promise<{ id: string; permalink: string | null }> {
  const { pageId, token, kind, message, file, scheduledUnix } = input;
  const schedule: Record<string, string> = scheduledUnix ? { published: "false", scheduled_publish_time: String(scheduledUnix) } : {};

  if (kind === "text") {
    const created = await graph<{ id: string }>(`${pageId}/feed`, token, { method: "POST", params: { message, ...schedule } });
    return { id: created.id, permalink: null };
  }
  if (!file) throw new Error("fb_media_required");

  if (kind === "photo") {
    const form = new FormData();
    form.append("source", file, file.name);
    const created = await graph<{ id: string; post_id?: string }>(`${pageId}/photos`, token, { method: "POST", form, params: { message, ...schedule }, timeoutMs: 300000 });
    return { id: created.post_id || created.id, permalink: null };
  }
  if (kind === "video") {
    const form = new FormData();
    form.append("source", file, file.name);
    const created = await graph<{ id: string }>(`${pageId}/videos`, token, { method: "POST", form, params: { description: message, ...schedule }, timeoutMs: 600000 });
    return { id: created.id, permalink: null };
  }

  // Reels: start session -> upload bytes -> finish (publish, draft or schedule).
  const started = await graph<{ video_id: string }>(`${pageId}/video_reels`, token, { method: "POST", params: { upload_phase: "start" } });
  const uploadResponse = await fetch(`${RUPLOAD}/${started.video_id}`, {
    method: "POST",
    cache: "no-store",
    headers: { Authorization: `OAuth ${token}`, offset: "0", file_size: String(file.size), "Content-Type": "application/octet-stream" },
    body: file,
    signal: AbortSignal.timeout(900000),
  });
  if (!uploadResponse.ok) {
    const detail = (await uploadResponse.json().catch(() => ({}))) as { error?: { message?: string; code?: number } };
    throw new GraphError(detail.error?.message || `Tải Reels thất bại (HTTP ${uploadResponse.status})`, detail.error?.code ?? null, uploadResponse.status);
  }
  const finish: Record<string, string> = {
    upload_phase: "finish",
    video_id: started.video_id,
    video_state: scheduledUnix ? "SCHEDULED" : "PUBLISHED",
    description: message,
  };
  if (scheduledUnix) finish.scheduled_publish_time = String(scheduledUnix);
  const done = await graph<{ success?: boolean; post_id?: string }>(`${pageId}/video_reels`, token, { method: "POST", params: finish });
  return { id: done.post_id || started.video_id, permalink: null };
}

export async function deleteRemotePost(facebookId: string, token: string) {
  await graph<{ success?: boolean }>(facebookId, token, { method: "DELETE" });
}

export async function pageOverview(workspaceId: string) {
  const creds = await activeCredentials(workspaceId);
  const page = await graph<{ id: string; name: string; fan_count?: number; followers_count?: number }>(creds.pageId, creds.token, { params: { fields: "id,name,fan_count,followers_count" } });
  const posts = await graph<{ data: { id: string; message?: string; created_time: string; permalink_url?: string; shares?: { count: number }; likes?: { summary?: { total_count: number } }; comments?: { summary?: { total_count: number } } }[] }>(
    `${creds.pageId}/posts`,
    creds.token,
    { params: { fields: "id,message,created_time,permalink_url,shares,likes.summary(true).limit(0),comments.summary(true).limit(0)", limit: "12" } },
  );
  return {
    page: { id: page.id, name: page.name, fanCount: page.fan_count ?? 0, followers: page.followers_count ?? 0 },
    tasks: creds.tasks,
    canPublish: creds.canPublish,
    posts: posts.data.map((post) => ({
      id: post.id,
      message: post.message ?? "",
      createdAt: post.created_time,
      permalink: post.permalink_url ?? null,
      shares: post.shares?.count ?? 0,
      likes: post.likes?.summary?.total_count ?? 0,
      comments: post.comments?.summary?.total_count ?? 0,
    })),
  };
}

/**
 * Pulls Monetization metrics for the last 28 days. Meta exposes these only to Page admins and only
 * for eligible Pages; failures are returned per metric so the UI can explain them instead of hiding them.
 */
export async function syncPageEarnings(workspaceId: string) {
  const creds = await activeCredentials(workspaceId);
  if (!creds.canAnalyze) throw new Error("fb_no_publish_rights");
  const until = new Date();
  const since = new Date(until.getTime() - 28 * 24 * 60 * 60 * 1000);
  const dateOf = (value: Date) => value.toISOString().slice(0, 10);
  const errors: { metric: string; message: string }[] = [];
  let synced = 0;
  for (const metric of EARNINGS_METRICS) {
    try {
      const result = await graph<{ data: { name: string; values: { value: number | Record<string, number>; end_time: string }[] }[] }>(
        `${creds.pageId}/insights`,
        creds.token,
        { params: { metric, period: "day", since: dateOf(since), until: dateOf(until) } },
      );
      for (const series of result.data) {
        for (const point of series.values) {
          const amount = typeof point.value === "number" ? point.value : Object.values(point.value).reduce((sum, item) => sum + (Number(item) || 0), 0);
          if (!amount) continue;
          const day = point.end_time.slice(0, 10);
          const externalKey = `${metric}|${creds.pageId}|${day}`;
          await db.insert(facebookEarnings).values({
            workspaceId, pageId: creds.pageId, periodStart: day, periodEnd: day, metric, source: "meta_api",
            amount: amount.toFixed(2), currency: "USD", note: "Đồng bộ từ Meta Insights", externalKey,
          }).onConflictDoUpdate({
            target: [facebookEarnings.workspaceId, facebookEarnings.externalKey],
            set: { amount: amount.toFixed(2), metric },
          });
          synced++;
        }
      }
    } catch (error) {
      errors.push({ metric, message: error instanceof GraphError ? error.message : "Không đọc được chỉ số" });
    }
  }
  await db.update(facebookConnections).set({ earningsSyncedAt: new Date(), updatedAt: new Date() }).where(eq(facebookConnections.workspaceId, workspaceId));
  return { synced, errors, since: dateOf(since), until: dateOf(until) };
}

export async function listPosts(workspaceId: string) {
  return db.select().from(facebookPosts).where(eq(facebookPosts.workspaceId, workspaceId)).orderBy(desc(facebookPosts.createdAt)).limit(150);
}

export async function getOwnedPost(workspaceId: string, id: string) {
  const [row] = await db.select().from(facebookPosts).where(and(eq(facebookPosts.id, id), eq(facebookPosts.workspaceId, workspaceId))).limit(1);
  return row || null;
}
