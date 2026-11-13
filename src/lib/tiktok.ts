import "server-only";
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { tiktokConnections, tiktokPosts } from "@/db/schema";
import { decrypt, encrypt, safeEqual } from "@/lib/security";
import { apiError } from "@/lib/workspace";
import type { TkPrivacy } from "@/lib/tiktok-policy";
import { classifyCredentialProbe, diagnoseTikTok, environmentGuidance, fingerprintSecret, sanitizeSecret, type EnvironmentGuidance, type TikTokDiagnosis, type VerificationResult } from "@/lib/tiktok-config";

export const TIKTOK_COOKIE = "tubeflow_tiktok_oauth";
/** Every product scope we may ask for, in the order TikTok expects them. */
export const TIKTOK_SCOPES = ["user.info.basic", "video.list", "video.publish", "video.upload"];
/**
 * Default request: only `user.info.basic`, which TikTok adds to every app automatically.
 * Requesting a scope the app has not been granted can make the authorize page fail with a
 * generic error, so publishing scopes are opt-in through TIKTOK_SCOPES.
 */
export const DEFAULT_TIKTOK_SCOPES = ["user.info.basic"];
const REQUIRED_SCOPES = ["user.info.basic"];

/** Reads TIKTOK_SCOPES, keeping only values TikTok knows and rejecting an empty result. */
export function requestedScopes(): string[] {
  const raw = sanitizeSecret(process.env.TIKTOK_SCOPES);
  if (!raw) return [...DEFAULT_TIKTOK_SCOPES];
  const wanted = raw.split(/[,\s]+/).map((value) => value.trim()).filter(Boolean);
  const valid = TIKTOK_SCOPES.filter((scope) => wanted.includes(scope));
  return valid.length ? valid : [...DEFAULT_TIKTOK_SCOPES];
}

/** Scopes we ask for that are not the guaranteed minimum — useful for the UI warning. */
export function extraScopes(): string[] {
  return requestedScopes().filter((scope) => !REQUIRED_SCOPES.includes(scope));
}

const AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const API = "https://open.tiktokapis.com/v2";

export class TikTokError extends Error {
  constructor(message: string, public readonly code: string, public readonly status = 502) {
    super(message);
  }
}

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: number;
  refreshExpiresAt: number;
  scope: string;
}

/**
 * Reads TikTok credentials with Windows-safe sanitising (BOM, quotes, stray newlines) and verifies
 * them beyond length. `ready` is false when the value is a placeholder, an App ID, or malformed —
 * cases where TikTok answers with a "client_key" error page instead of a useful message.
 */
export function tiktokConfig() {
  const clientKey = sanitizeSecret(process.env.TIKTOK_CLIENT_KEY);
  const clientSecret = sanitizeSecret(process.env.TIKTOK_CLIENT_SECRET);
  const diagnosis = diagnoseTikTok(process.env.APP_URL, clientKey, clientSecret, process.env.TIKTOK_REDIRECT_URI, process.env.TIKTOK_SITE_VERIFICATION);
  return {
    clientKey,
    clientSecret,
    diagnosis,
    appUrl: diagnosis.appUrl,
    redirectUri: diagnosis.redirectUri,
    scopes: requestedScopes(),
    ready: diagnosis.configured,
  };
}

export function randomState() {
  return randomBytes(24).toString("base64url");
}

export function tiktokDialogUrl(state: string) {
  const config = tiktokConfig();
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_key: config.clientKey,
    response_type: "code",
    scope: config.scopes.join(","),
    redirect_uri: config.redirectUri,
    state,
  }).toString();
  return url.toString();
}

/** Same request as `tiktokDialogUrl`, with the client_key masked, for on-screen comparison. */
export function tiktokDialogPreview() {
  const config = tiktokConfig();
  const key = config.clientKey;
  const masked = key.length > 8 ? `${key.slice(0, 4)}…${key.slice(-4)}` : "(chưa có)";
  return {
    endpoint: AUTH_URL,
    clientKeyMasked: masked,
    scopes: config.scopes,
    redirectUri: config.redirectUri,
    responseType: "code",
  };
}

export function verifyState(cookieValue: string | undefined, state: string | null) {
  return Boolean(cookieValue && state && safeEqual(cookieValue, state));
}

/** TikTok returns `{ error: { code, message } }` on most endpoints and `error_code` on OAuth. */
interface TikTokEnvelope<T> {
  data?: T;
  error?: { code?: string; message?: string };
  error_code?: number | string;
  message?: string;
  open_id?: string;
}

function assertOk<T>(envelope: TikTokEnvelope<T>, context: string): T {
  const code = String(envelope.error?.code ?? envelope.error_code ?? "");
  const message = envelope.error?.message || envelope.message || `${context} thất bại`;
  if (code && code !== "ok" && code !== "0") {
    if (/access_token.*(expired|invalid)|unauthorized/i.test(message) || code === "access_token_invalid") {
      throw new TikTokError("Kết nối TikTok đã hết hạn hoặc bị thu hồi. Hãy kết nối lại.", "reconnect", 401);
    }
    if (/scope|permission|not.?allowed/i.test(message)) {
      throw new TikTokError("Tài khoản chưa được cấp quyền cho thao tác này trên TikTok.", "permission", 403);
    }
    throw new TikTokError(message, "tiktok_api", 502);
  }
  return (envelope.data ?? envelope) as T;
}

async function tokenRequest(params: Record<string, string>): Promise<StoredTokens & { openId: string }> {
  const config = tiktokConfig();
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
    // Sanitise here too: a quoted or padded secret copied on Windows makes TikTok answer "malformed".
    body: new URLSearchParams({ client_key: config.clientKey, client_secret: sanitizeSecret(process.env.TIKTOK_CLIENT_SECRET), ...params }).toString(),
    signal: AbortSignal.timeout(20000),
  });
  const body = (await response.json().catch(() => ({}))) as TikTokEnvelope<Record<string, unknown>>;
  const raw = (body.data ?? body) as Record<string, unknown>;
  const accessToken = String(raw.access_token ?? "");
  const refreshToken = String(raw.refresh_token ?? "");
  if (!accessToken || !refreshToken) {
    const code = String(raw.error ?? body.error?.code ?? "");
    const description = String(raw.error_description || body.error?.message || body.message || "Không đổi được mã xác thực.");
    const logId = String(raw.log_id ?? "");
    // TikTok answers "The request parameters are malformed" both for a broken request AND for a
    // key/secret pair it does not recognise, so the code and log id must be surfaced verbatim.
    const message = [code && `${code}:`, description, logId && `(log_id ${logId})`].filter(Boolean).join(" ");
    throw new TikTokError(message, /expired|used|invalid|code/i.test(description) ? "reconnect" : "token_exchange", 502);
  }
  const now = Date.now();
  return {
    accessToken,
    refreshToken,
    accessExpiresAt: now + Number(raw.expires_in ?? 86400) * 1000,
    refreshExpiresAt: now + Number(raw.refresh_expires_in ?? 31536000) * 1000,
    scope: String(raw.scope ?? ""),
    openId: String(raw.open_id ?? ""),
  };
}

export async function getTikTokConnection(workspaceId: string) {
  const [row] = await db.select().from(tiktokConnections).where(eq(tiktokConnections.workspaceId, workspaceId)).limit(1);
  return row || null;
}

function readTokens(row: typeof tiktokConnections.$inferSelect): StoredTokens {
  try {
    return decrypt<StoredTokens>(row.encryptedTokens);
  } catch {
    throw new TikTokError("Token TikTok lưu trữ không đọc được. Hãy kết nối lại.", "reconnect", 401);
  }
}

/**
 * Returns a usable access token, refreshing it first when it is close to expiry.
 * TikTok may rotate the refresh token on every refresh, so the new pair is always persisted.
 */
export async function validTokens(workspaceId: string): Promise<StoredTokens> {
  const row = await getTikTokConnection(workspaceId);
  if (!row) throw new TikTokError("Bạn chưa kết nối TikTok.", "tiktok_not_connected", 409);
  let tokens = readTokens(row);
  if (tokens.accessExpiresAt > Date.now() + 5 * 60_000) return tokens;
  if (tokens.refreshExpiresAt <= Date.now()) {
    throw new TikTokError("Kết nối TikTok đã hết hạn. Hãy kết nối lại tài khoản.", "reconnect", 401);
  }
  try {
    tokens = await tokenRequest({ grant_type: "refresh_token", refresh_token: tokens.refreshToken });
    await db.update(tiktokConnections).set({
      encryptedTokens: encrypt(tokens),
      tokenExpiresAt: new Date(tokens.accessExpiresAt),
      refreshExpiresAt: new Date(tokens.refreshExpiresAt),
      updatedAt: new Date(),
    }).where(eq(tiktokConnections.workspaceId, workspaceId));
    return tokens;
  } catch (error) {
    if (error instanceof TikTokError) throw error;
    throw new TikTokError("Không làm mới được token TikTok. Hãy kết nối lại.", "reconnect", 401);
  }
}

async function tkGet<T>(path: string, token: string, params: Record<string, string> = {}) {
  const url = new URL(`${API}${path}`);
  url.search = new URLSearchParams(params).toString();
  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(25000),
  });
  return assertOk<T>((await response.json().catch(() => ({}))) as TikTokEnvelope<T>, path);
}

async function tkPost<T>(path: string, token: string, body: unknown) {
  const response = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(25000),
  });
  return assertOk<T>((await response.json().catch(() => ({}))) as TikTokEnvelope<T>, path);
}

interface UserInfoData {
  user?: { open_id?: string; union_id?: string; avatar_url?: string; display_name?: string; username?: string; bio_description?: string; profile_deep_link?: string; follower_count?: number; following_count?: number; likes_count?: number; video_count?: number };
}

/**
 * `/user/info/` returns an error when a requested field needs a scope the token does not carry.
 * Requesting everything with only `user.info.basic` (the Sandbox default) used to break the whole
 * connection, so fields are grouped by their scope and requested only when granted.
 */
const USER_FIELD_GROUPS: { scope: string; fields: string[] }[] = [
  { scope: "user.info.basic", fields: ["open_id", "union_id", "avatar_url", "display_name"] },
  { scope: "user.info.profile", fields: ["username", "bio_description", "profile_deep_link", "is_verified"] },
  { scope: "user.info.stats", fields: ["follower_count", "following_count", "likes_count", "video_count"] },
];

/** Completes Login Kit and stores both tokens. Access tokens last 24h, refresh tokens 365 days. */
export async function completeConnection(workspaceId: string, code: string) {
  const config = tiktokConfig();
  if (!config.ready) throw new TikTokError("Chưa cấu hình TIKTOK_CLIENT_KEY và TIKTOK_CLIENT_SECRET trên máy chủ.", "tiktok_missing_config", 503);
  const tokens = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: config.redirectUri });
  const granted = tokens.scope.split(/[,\s]+/).filter(Boolean);

  // Always ask for the guaranteed set, then add only the groups the token actually covers.
  const basicFields = USER_FIELD_GROUPS[0].fields;
  let user: NonNullable<UserInfoData["user"]> = {};
  try {
    const info = await tkGet<UserInfoData>("/user/info/", tokens.accessToken, { fields: basicFields.join(",") });
    user = info.user ?? {};
  } catch (error) {
    throw new TikTokError(
      error instanceof TikTokError ? `Không đọc được thông tin tài khoản: ${error.message}` : "Không đọc được thông tin tài khoản TikTok.",
      "google_userinfo_failed",
      502,
    );
  }

  // Extra fields are optional: never fail the connection because profile/statistics are unavailable.
  for (const group of USER_FIELD_GROUPS.slice(1)) {
    if (!granted.includes(group.scope)) continue;
    try {
      const extra = await tkGet<UserInfoData>("/user/info/", tokens.accessToken, { fields: group.fields.join(",") });
      user = { ...user, ...(extra.user ?? {}) };
    } catch { /* optional fields only */ }
  }
  const values = {
    openId: tokens.openId || user.open_id || workspaceId,
    username: user.username ?? "",
    displayName: user.display_name ?? user.username ?? "Tài khoản TikTok",
    avatarUrl: user.avatar_url ?? null,
    profileDeepLink: user.profile_deep_link ?? null,
    followerCount: Number(user.follower_count ?? 0),
    followingCount: Number(user.following_count ?? 0),
    likesCount: Number(user.likes_count ?? 0),
    videoCount: Number(user.video_count ?? 0),
    encryptedTokens: encrypt(tokens),
    grantedScopes: tokens.scope ? tokens.scope.split(/[,\s]+/).filter(Boolean) : [],
    tokenExpiresAt: new Date(tokens.accessExpiresAt),
    refreshExpiresAt: new Date(tokens.refreshExpiresAt),
    updatedAt: new Date(),
  };
  await db.insert(tiktokConnections).values({ workspaceId, ...values }).onConflictDoUpdate({
    target: tiktokConnections.workspaceId,
    set: values,
  });
  return { missingScopes: REQUIRED_SCOPES.filter((scope) => !values.grantedScopes.includes(scope)) };
}

export async function disconnectTikTok(workspaceId: string) {
  await db.delete(tiktokConnections).where(eq(tiktokConnections.workspaceId, workspaceId));
}

export interface TkStatus {
  configured: boolean;
  redirectUri: string;
  connected: boolean;
  account: { openId: string; username: string; displayName: string; avatarUrl: string | null; profileDeepLink: string | null; followerCount: number; followingCount: number; likesCount: number; videoCount: number } | null;
  grantedScopes: string[];
  missingScopes: string[];
  reconnectRequired: boolean;
  canPublish: boolean;
  canUpload: boolean;
  privacyOptions: string[];
  tokenExpiresAt: string | null;
  refreshExpiresAt: string | null;
  /** Safe configuration diagnosis (never contains credential values). */
  diagnostics: TikTokDiagnosis;
  /** Sandbox vs Production instructions that match the configured key. */
  environment: EnvironmentGuidance;
  /** Scopes the authorize request will ask for, and the request shape for comparison. */
  request: ReturnType<typeof tiktokDialogPreview>;
  /** Scopes beyond user.info.basic that must be granted to the app in TikTok for Developers. */
  extraScopes: string[];
}

export async function statusFor(workspaceId: string): Promise<TkStatus> {
  const config = tiktokConfig();
  const diagnostics: TikTokDiagnosis = config.diagnosis;
  const row = await getTikTokConnection(workspaceId);
  if (!row) {
    return {
      configured: config.ready, redirectUri: config.redirectUri, connected: false, account: null,
      grantedScopes: [], missingScopes: REQUIRED_SCOPES, reconnectRequired: false,
      canPublish: false, canUpload: false, privacyOptions: [], tokenExpiresAt: null, refreshExpiresAt: null,
      diagnostics,
      environment: environmentGuidance(diagnostics.environment),
      request: tiktokDialogPreview(),
      extraScopes: extraScopes(),
    };
  }
  let reconnectRequired = false;
  let tokens: StoredTokens | null = null;
  try { tokens = readTokens(row); } catch { reconnectRequired = true; }
  if (tokens && tokens.refreshExpiresAt <= Date.now()) reconnectRequired = true;
  return {
    configured: config.ready,
    redirectUri: config.redirectUri,
    connected: true,
    account: {
      openId: row.openId,
      username: row.username,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
      profileDeepLink: row.profileDeepLink,
      followerCount: row.followerCount,
      followingCount: row.followingCount,
      likesCount: row.likesCount,
      videoCount: row.videoCount,
    },
    grantedScopes: row.grantedScopes,
    missingScopes: REQUIRED_SCOPES.filter((scope) => !row.grantedScopes.includes(scope)),
    reconnectRequired,
    canPublish: row.grantedScopes.includes("video.publish"),
    canUpload: row.grantedScopes.includes("video.upload"),
    privacyOptions: row.privacyOptions,
    tokenExpiresAt: row.tokenExpiresAt?.toISOString() ?? null,
    refreshExpiresAt: row.refreshExpiresAt?.toISOString() ?? null,
    diagnostics,
    environment: environmentGuidance(diagnostics.environment),
    request: tiktokDialogPreview(),
    extraScopes: extraScopes(),
  };
}

/** Creator settings TikTok allows for this account, including the privacy levels we may request. */
export async function creatorInfo(workspaceId: string) {
  const tokens = await validTokens(workspaceId);
  const info = await tkPost<{ creator_nickname?: string; privacy_level_options?: string[]; comment_disabled?: boolean; duet_disabled?: boolean; stitch_disabled?: boolean }>(
    "/post/publish/creator_info/query/", tokens.accessToken, {},
  );
  const options = (info.privacy_level_options ?? []) as string[];
  await db.update(tiktokConnections).set({ privacyOptions: options, updatedAt: new Date() }).where(eq(tiktokConnections.workspaceId, workspaceId));
  return {
    nickname: info.creator_nickname ?? "",
    privacyLevelOptions: options,
    commentDisabled: !!info.comment_disabled,
    duetDisabled: !!info.duet_disabled,
    stitchDisabled: !!info.stitch_disabled,
  };
}

export interface TkPublishInput {
  mode: "direct" | "inbox";
  title: string;
  privacyLevel: TkPrivacy;
  disableComment: boolean;
  disableDuet: boolean;
  disableStitch: boolean;
  coverTimestampMs: number;
  file: File;
}

export interface TkPublishResult {
  publishId: string;
  uploadUrlPresent: boolean;
}

/**
 * Publishes a video through TikTok's Content Posting API.
 * Direct Post (`video.publish`) needs `post_info`; Upload to inbox (`video.upload`) sends only the file.
 * The binary is streamed to TikTok's upload URL with a Content-Range header in one chunk.
 */
export async function publishVideo(workspaceId: string, input: TkPublishInput): Promise<TkPublishResult> {
  const tokens = await validTokens(workspaceId);
  const scope = tokens.scope.split(/[,\s]+/).filter(Boolean);
  const wantsPublish = input.mode === "direct";
  if (wantsPublish && !scope.includes("video.publish")) {
    throw new TikTokError("Tài khoản chưa được cấp quyền video.publish. Chọn chế độ “Gửi vào hộp thư TikTok” hoặc cập nhật quyền của ứng dụng.", "permission", 403);
  }
  if (!wantsPublish && !scope.includes("video.upload")) {
    throw new TikTokError("Tài khoản chưa được cấp quyền video.upload cho chế độ hộp thư.", "permission", 403);
  }

  const size = input.file.size;
  const initBody = wantsPublish
    ? {
        post_info: {
          title: input.title.slice(0, 2200),
          privacy_level: input.privacyLevel,
          disable_duet: input.disableDuet,
          disable_comment: input.disableComment,
          disable_stitch: input.disableStitch,
          video_cover_timestamp_ms: Math.max(0, input.coverTimestampMs),
        },
        source_info: { source: "FILE_UPLOAD", video_size: size, chunk_size: size, total_chunk_count: 1 },
      }
    : { source_info: { source: "FILE_UPLOAD", video_size: size, chunk_size: size, total_chunk_count: 1 } };

  const path = wantsPublish ? "/post/publish/video/init/" : "/post/publish/inbox/video/init/";
  const init = await tkPost<{ publish_id?: string; upload_url?: string; video_id?: string }>(path, tokens.accessToken, initBody);
  const uploadUrl = init.upload_url ?? "";
  const publishId = init.publish_id ?? init.video_id ?? "";
  if (!uploadUrl || !publishId) throw new TikTokError("TikTok không trả về phiên tải lên.", "tiktok_api", 502);

  const upload = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Range": `bytes 0-${size - 1}/${size}`,
      "Content-Length": String(size),
    },
    body: input.file,
    cache: "no-store",
    signal: AbortSignal.timeout(900000),
  });
  if (!upload.ok) {
    const detail = await upload.text().catch(() => "");
    throw new TikTokError(`Tải video lên TikTok thất bại (HTTP ${upload.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`, "tiktok_api", 502);
  }
  return { publishId, uploadUrlPresent: true };
}

/** Status of a submitted post. PUBLISH_COMPLETE means it is live; FAILED carries TikTok's reason. */
export async function publishStatus(workspaceId: string, publishId: string) {
  const tokens = await validTokens(workspaceId);
  const result = await tkPost<{ status?: string; fail_reason?: string; video?: { id?: string; cover_image_url?: string } }>(
    "/post/publish/status/fetch/", tokens.accessToken, { publish_id: publishId },
  );
  return {
    status: result.status ?? "UNKNOWN",
    failReason: result.fail_reason ?? null,
    videoId: result.video?.id ?? null,
  };
}

export interface TkVideo { id: string; title: string; cover: string | null; duration: number | null; createTime: string | null; shareUrl: string | null; likeCount: number; commentCount: number; viewCount: number }

/** Published videos from TikTok's Display API, used for history and verification. */
export async function listVideos(workspaceId: string, maxCount = 20): Promise<TkVideo[]> {
  const tokens = await validTokens(workspaceId);
  const result = await tkPost<{ videos?: { id?: string; title?: string; video_description?: string; cover_image_url?: string; duration?: number; create_time?: string | number; share_url?: string; like_count?: number; comment_count?: number; view_count?: number }[] }>(
    "/video/list/", tokens.accessToken,
    { max_count: Math.min(Math.max(maxCount, 1), 20) },
  ).catch(() => ({ videos: [] as never[] }));
  return (result.videos ?? []).map((video) => ({
    id: String(video.id ?? ""),
    title: video.title || video.video_description || "(Không có tiêu đề)",
    cover: video.cover_image_url ?? null,
    duration: typeof video.duration === "number" ? video.duration : Number(video.duration ?? 0) || null,
    createTime: video.create_time ? String(video.create_time) : null,
    shareUrl: video.share_url ?? null,
    likeCount: Number(video.like_count ?? 0),
    commentCount: Number(video.comment_count ?? 0),
    viewCount: Number(video.view_count ?? 0),
  }));
}

export async function listPosts(workspaceId: string) {
  return db.select().from(tiktokPosts).where(eq(tiktokPosts.workspaceId, workspaceId)).orderBy(desc(tiktokPosts.createdAt)).limit(150);
}

export function tiktokErrorResponse(error: unknown) {
  if (error instanceof TikTokError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  const code = error instanceof Error ? error.message : "";
  if (code === "tiktok_not_connected") return NextResponse.json({ error: "Bạn chưa kết nối TikTok.", code }, { status: 409 });
  return apiError(error);
}

/**
 * Asks TikTok directly whether it recognises the configured client_key by requesting a
 * Client Access Token (`grant_type=client_credentials`). No user token and no interaction
 * quota are consumed, so this is safe to run while diagnosing the login dialog.
 *
 * This separates the two possible causes of TikTok's `client_key` error page:
 * - not_recognised  → the value really is wrong (App ID, Sandbox/Production mix-up, typo)
 * - recognized      → the key is fine; the dialog rejection is about app mode, target users
 *                     or the registered Redirect URI
 */
export async function verifyClientKey(): Promise<VerificationResult & {
  fingerprint: ReturnType<typeof fingerprintSecret>;
  secretFingerprint: ReturnType<typeof fingerprintSecret>;
  redirectUri: string;
  scopes: string[];
  environment: string;
}> {
  const config = tiktokConfig();
  const fingerprint = fingerprintSecret(config.clientKey);
  const secretFingerprint = fingerprintSecret(config.clientSecret);
  const extra = { secretFingerprint, redirectUri: config.redirectUri, scopes: config.scopes, environment: config.diagnosis.environment };
  if (!config.clientKey || !config.clientSecret) {
    return { verdict: "not_configured", providerError: null, providerMessage: "Thiếu client_key hoặc client_secret trên máy chủ.", checkedAt: new Date().toISOString(), fingerprint, ...extra };
  }
  try {
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
      body: new URLSearchParams({
        client_key: config.clientKey,
        client_secret: config.clientSecret,
        grant_type: "client_credentials",
      }).toString(),
      signal: AbortSignal.timeout(20000),
    });
    const body = await response.json().catch(() => ({}));
    const result = classifyCredentialProbe(response.status, body);
    // Both values look structurally correct yet TikTok says the request is malformed. In that case
    // the request shape is fine and the pair itself is unknown to TikTok — almost always a secret
    // regenerated in the portal but not updated here, or key and secret taken from different tabs.
    const pairLooksWellFormed = config.diagnosis.clientKey.blocking === false && config.diagnosis.clientSecret.blocking === false;
    const verdict = result.verdict === "inconclusive" && pairLooksWellFormed ? "pair_not_recognized" : result.verdict;
    return { ...result, verdict, fingerprint, ...extra };
  } catch {
    return { verdict: "network", providerError: null, providerMessage: "Không gọi được máy chủ TikTok từ máy này.", checkedAt: new Date().toISOString(), fingerprint, ...extra };
  }
}
