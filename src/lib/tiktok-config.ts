/**
 * TikTok credential hygiene and diagnostics.
 * Pure module (no server-only import) so it can be unit-tested and reused.
 *
 * TikTok reports `client_key` when the value we send is not a valid Production/Sandbox client key.
 * A value can be long enough to look plausible yet still be rejected, so length alone is not enough:
 * placeholders, quoted Windows copy-paste, an App ID instead of a Client Key, and mixing a Sandbox
 * key with a Production redirect URI all produce exactly that error page.
 */

/** Remove a BOM, surrounding whitespace/newlines and one layer of matching quotes. */
export function sanitizeSecret(raw: string | undefined | null): string {
  if (!raw) return "";
  let value = raw.replace(/^\uFEFF/, "").replace(/[\r\n\t]+/g, "").trim();
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' || first === "'" || first === "`") && first === last) value = value.slice(1, -1);
  }
  return value.trim();
}

const PLACEHOLDER = /^(your|my|example|sample|changeme|change_me|placeholder|todo|test|demo|secret|client_key|clientkey|app_id|appid|xxx)\b|client[_\s-]?key|app[_\s-]?id|xxxx|<|>/i;

export type ClientKeyKind =
  | "missing"
  | "placeholder"
  | "malformed"
  | "app-id-likely"
  | "sandbox"
  | "production"
  | "unverified";

export interface ClientKeyCheck {
  present: boolean;
  length: number;
  kind: ClientKeyKind;
  /** Safe, human-readable explanation. Never contains the secret itself. */
  note: string;
  blocking: boolean;
}

export function classifyClientKey(raw: string | undefined | null): ClientKeyCheck {
  const value = sanitizeSecret(raw);
  if (!value) {
    return { present: false, length: 0, kind: "missing", note: "Chưa có TIKTOK_CLIENT_KEY trên máy chủ.", blocking: true };
  }
  if (PLACEHOLDER.test(value)) {
    return { present: true, length: value.length, kind: "placeholder", note: "Giá trị đang là mẫu/placeholder, không phải Client Key thật.", blocking: true };
  }
  if (/\s/.test(value) || /[^\x20-\x7E]/.test(value)) {
    return { present: true, length: value.length, kind: "malformed", note: "Client Key chứa khoảng trắng hoặc ký tự lạ (thường do dán kèm xuống dòng).", blocking: true };
  }
  if (/^\d{8,25}$/.test(value)) {
    return { present: true, length: value.length, kind: "app-id-likely", note: "Giá trị chỉ gồm chữ số — đây có thể là App ID, không phải Client Key.", blocking: true };
  }
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(value)) {
    return { present: true, length: value.length, kind: "malformed", note: "Client Key có ký tự không hợp lệ (Client Key của TikTok chỉ gồm chữ, số).", blocking: true };
  }
  // TikTok sandbox keys are conventionally prefixed "sb"; production keys start with "aw".
  if (/^sb/i.test(value)) {
    return { present: true, length: value.length, kind: "sandbox", note: "Có dấu hiệu là Client Key của môi trường Sandbox (bắt đầu bằng “sb”).", blocking: false };
  }
  if (/^aw/i.test(value)) {
    return { present: true, length: value.length, kind: "production", note: "Có dạng Client Key Production (bắt đầu bằng “aw”).", blocking: false };
  }
  return { present: true, length: value.length, kind: "unverified", note: "Không nhận diện được định dạng quen thuộc; hãy đối chiếu lại trong TikTok for Developers.", blocking: false };
}

export interface SecretCheck {
  present: boolean;
  length: number;
  blocking: boolean;
  note: string;
}

export function classifySecret(raw: string | undefined | null): SecretCheck {
  const value = sanitizeSecret(raw);
  if (!value) return { present: false, length: 0, blocking: true, note: "Chưa có TIKTOK_CLIENT_SECRET trên máy chủ." };
  if (PLACEHOLDER.test(value)) return { present: true, length: value.length, blocking: true, note: "Client Secret đang là giá trị mẫu/placeholder." };
  if (value.length < 16) return { present: true, length: value.length, blocking: true, note: "Client Secret quá ngắn, có thể bị cắt khi dán." };
  if (/\s/.test(value)) return { present: true, length: value.length, blocking: true, note: "Client Secret chứa khoảng trắng hoặc xuống dòng." };
  return { present: true, length: value.length, blocking: false, note: "Đã có Client Secret." };
}

export interface TikTokDiagnosis {
  configured: boolean;
  /** The app origin without any trailing slash (what APP_URL should contain). */
  appUrl: string;
  /** True when APP_URL is a Cloudflare Quick Tunnel: the hostname changes on every restart. */
  quickTunnel: boolean;
  /** What must be registered in TikTok Login Kit → Redirect URI, verbatim. */
  redirectUriToRegister: string;
  /** True when TIKTOK_REDIRECT_URI overrides the value derived from APP_URL. */
  redirectOverridden: boolean;
  /** Hostname TikTok must be able to verify ownership of. */
  hostname: string;
  /** Signature from TikTok, i.e. the part after "tiktok-developers-site-verification=". */
  verificationSignature: string | null;
  /** File name TikTok actually fetches: tiktok<SIGNATURE>.txt */
  verificationFileName: string | null;
  /** Public URL TikTok fetches for URL-prefix verification. */
  verificationFileUrl: string | null;
  /** Backstop URL kept for older instructions. */
  verificationBackstopUrl: string | null;
  /** Whether that verification file is configured at all. */
  verificationConfigured: boolean;
  /** Which TikTok app environment the configured key appears to belong to. */
  environment: "sandbox" | "production" | "unclear";
  /** Two-letter prefix of the key, enough to compare with the portal without revealing it. */
  keyPrefix: string;
  clientKeyFingerprint: { length: number; masked: string; sha256Prefix: string };
  redirectUri: string;
  clientKey: ClientKeyCheck;
  clientSecret: SecretCheck;
  problems: string[];
  warnings: string[];
  /** True when the only remaining doubt is Sandbox vs Production, which TikTok resolves server-side. */
  likelySandboxMismatch: boolean;
}

/** Builds an actionable diagnosis without ever exposing a credential value. */
export function diagnoseTikTok(
  appUrlRaw: string | undefined,
  clientKeyRaw: string | undefined,
  clientSecretRaw: string | undefined,
  redirectUriRaw?: string | undefined,
  verificationTokenRaw?: string | undefined,
): TikTokDiagnosis {
  const appUrl = (sanitizeSecret(appUrlRaw) || "http://localhost:3000").replace(/\/+$/, "");
  const override = sanitizeSecret(redirectUriRaw);
  const redirectOverridden = override.length > 0;
  const redirectUri = redirectOverridden ? override : `${appUrl}/api/tiktok/callback`;
  const hostname = (() => { try { return new URL(redirectUri).hostname; } catch { return ""; } })();
  const keyValue = sanitizeSecret(clientKeyRaw);
  const keyPrefix = keyValue.slice(0, 2).toLowerCase();
  const environment: "sandbox" | "production" | "unclear" = keyPrefix === "sb" ? "sandbox" : keyPrefix === "aw" ? "production" : "unclear";
  const verificationRaw = sanitizeSecret(verificationTokenRaw);
  // Accept the full line, or just the signature on its own.
  const verificationSignature = verificationRaw
    ? verificationRaw.replace(/^tiktok-developers-site-verification=/i, "").trim() || null
    : null;
  const verificationFileName = verificationSignature ? `tiktok${verificationSignature}.txt` : null;
  const verificationFileUrl = verificationSignature && hostname ? `https://${hostname}/${verificationFileName}` : null;
  const verificationBackstopUrl = verificationSignature && hostname ? `https://${hostname}/tiktok-developers-site-verification.txt` : null;
  const clientKey = classifyClientKey(clientKeyRaw);
  const clientSecret = classifySecret(clientSecretRaw);
  const problems: string[] = [];
  const warnings: string[] = [];

  if (clientKey.blocking) problems.push(`client_key: ${clientKey.note}`);
  if (clientSecret.blocking) problems.push(`client_secret: ${clientSecret.note}`);
  if (clientKey.kind === "sandbox") {
    warnings.push("Bạn đang dùng Client Key có dấu hiệu của môi trường Sandbox. TikTok chỉ cho phép các tài khoản thử nghiệm đã thêm trong Sandbox đăng nhập, và Redirect URI phải được khai báo đúng trong tab Sandbox. Nếu muốn đăng nhập bằng tài khoản thật, hãy dùng Client Key của tab Production.");
  }
  if (!/^https:\/\//.test(appUrl)) {
    const local = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(appUrl);
    if (local) warnings.push("APP_URL đang là localhost. TikTok yêu cầu Redirect URI HTTPS cho bản chạy thật; localhost thường chỉ dùng khi thử nghiệm cục bộ có khai báo riêng trong ứng dụng TikTok.");
    else warnings.push("APP_URL không dùng HTTPS. TikTok yêu cầu Redirect URI bảo mật bằng HTTPS.");
  }

  const quickTunnel = (() => {
    try { return new URL(appUrl).hostname.endsWith(".trycloudflare.com"); } catch { return false; }
  })();
  if (quickTunnel) {
    warnings.push("APP_URL đang là Cloudflare Quick Tunnel: tên miền đổi mỗi lần khởi động lại cloudflared. Khi tên miền đổi, bạn phải cập nhật cả APP_URL lẫn Redirect URI trong TikTok, nếu không TikTok sẽ báo lỗi redirect_uri. Nên dùng Named Tunnel có tên miền cố định khi thử nhiều lần.");
    warnings.push("TikTok yêu cầu bạn xác thực quyền sở hữu tên miền trước khi thêm Redirect URI ở chế độ Production. Bạn không sở hữu trycloudflare.com nên KHÔNG thể xác thực tên miền này bằng DNS hay tệp xác thực. Hãy dùng chế độ Sandbox (không bắt buộc xác thực URL cho Login Kit) hoặc trỏ một tên miền bạn sở hữu vào tunnel.");
  }
  if (!quickTunnel && hostname && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(hostname)) {
    warnings.push("Tên miền trong Redirect URI phải được xác thực trong TikTok → URL properties trước khi thêm URI ở chế độ Production. Tạo bản ghi DNS TXT (khuyến nghị) hoặc tải tệp xác thực lên đúng đường dẫn TikTok cung cấp.");
  }

  return {
    configured: problems.length === 0,
    clientKeyFingerprint: fingerprintSecret(clientKeyRaw),
    appUrl,
    quickTunnel,
    redirectOverridden,
    hostname,
    redirectUriToRegister: redirectUri,
    verificationSignature,
    verificationFileName,
    verificationFileUrl,
    verificationBackstopUrl,
    verificationConfigured: verificationSignature !== null,
    environment,
    keyPrefix,
    redirectUri,
    clientKey,
    clientSecret,
    problems,
    warnings,
    likelySandboxMismatch: clientKey.kind === "sandbox",
  };
}

/** Non-reversible, human-comparable fingerprint. Never reveals the secret itself. */
export function fingerprintSecret(raw: string | undefined | null): { length: number; masked: string; sha256Prefix: string } {
  const value = sanitizeSecret(raw);
  if (!value) return { length: 0, masked: "(chưa có)", sha256Prefix: "" };
  const head = value.slice(0, 4);
  const tail = value.slice(-4);
  const masked = value.length <= 8 ? `${head}${"*".repeat(Math.max(0, value.length - 4))}` : `${head}…${tail}`;
  // Small, dependency-free SHA-256 for a comparable fingerprint.
  const sha256Prefix = sha256Hex(value).slice(0, 12);
  return { length: value.length, masked, sha256Prefix };
}

/** Compact synchronous SHA-256 (FIPS 180-4). Only used for a short fingerprint. */
export function sha256Hex(input: string): string {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const bytes = new TextEncoder().encode(input);
  const bits = bytes.length * 8;
  const padded = new Uint8Array((((bytes.length + 9) >> 6) + 1) << 6);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bits / 2 ** 32));
  view.setUint32(padded.length - 4, bits >>> 0);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  return H.map((x) => x.toString(16).padStart(8, "0")).join("");
}

export type ClientKeyVerdict =
  | "recognized"
  | "pair_not_recognized"
  | "inconclusive"
  | "not_recognized"
  | "secret_mismatch"
  | "unsupported_grant"
  | "network"
  | "not_configured";

export interface VerificationResult {
  verdict: ClientKeyVerdict;
  /** TikTok's own error type/code when present; safe to display. */
  providerError: string | null;
  providerMessage: string | null;
  checkedAt: string;
}

/**
 * Interprets TikTok's answer to a client_credentials token request.
 * This proves whether TikTok knows the client_key at all, which separates
 * "wrong key" from "key fine but app mode / redirect URI / target users".
 */
export function classifyCredentialProbe(status: number, body: unknown): VerificationResult {
  const checkedAt = new Date().toISOString();
  const payload = (body ?? {}) as Record<string, unknown>;
  const errorValue = payload.error;
  const providerError = typeof errorValue === "string"
    ? errorValue
    : errorValue && typeof errorValue === "object" && typeof (errorValue as { code?: unknown }).code === "string"
      ? String((errorValue as { code?: string }).code)
      : typeof payload.error_code === "number" || typeof payload.error_code === "string"
        ? String(payload.error_code)
        : null;
  const providerMessage = typeof payload.error_description === "string"
    ? payload.error_description
    : typeof payload.message === "string"
      ? payload.message
      : errorValue && typeof errorValue === "object" && typeof (errorValue as { message?: unknown }).message === "string"
        ? String((errorValue as { message?: string }).message)
        : null;

  if (status >= 200 && status < 300 && (payload.access_token || payload.data)) {
    return { verdict: "recognized", providerError: null, providerMessage: null, checkedAt };
  }
  const signal = `${providerError ?? ""} ${providerMessage ?? ""}`.toLowerCase();
  // Secret problems must be classified first: TikTok reports both cases under `invalid_client`,
  // so checking the generic client_key pattern first would blame the wrong credential.
  if (/client_secret|invalid_secret|\bsecret\b/.test(signal)) {
    return { verdict: "secret_mismatch", providerError, providerMessage, checkedAt };
  }
  if (/client_key|invalid_client|unauthorized_client|unknown client/.test(signal)) {
    return { verdict: "not_recognized", providerError, providerMessage, checkedAt };
  }
  if (/grant_type|unsupported_grant/.test(signal)) {
    return { verdict: "unsupported_grant", providerError, providerMessage, checkedAt };
  }
  // TikTok answers a non-existent key with `invalid_request / malformed` on this endpoint.
  // The same answer appears when client_credentials is disabled for the app, so we must not
  // claim the key is certainly wrong.
  if (/invalid_request|malformed|parameter/.test(signal)) {
    return { verdict: "inconclusive", providerError, providerMessage, checkedAt };
  }
  if (status === 0) return { verdict: "network", providerError, providerMessage, checkedAt };
  return { verdict: status >= 500 ? "network" : "not_recognized", providerError, providerMessage, checkedAt };
}

export interface EnvironmentGuidance {
  environment: "sandbox" | "production" | "unclear";
  label: string;
  summary: string;
  steps: string[];
  caveats: string[];
}

/**
 * Explains what the detected key environment implies.
 * TubeFlow cannot switch the tab inside TikTok's portal — the key itself carries the environment —
 * so this returns exact instructions for the side the user is on, plus the switch procedure.
 */
export function environmentGuidance(environment: "sandbox" | "production" | "unclear"): EnvironmentGuidance {
  if (environment === "sandbox") {
    return {
      environment,
      label: "Sandbox",
      summary: "Bạn đang dùng Client Key của tab Sandbox. Chỉ những tài khoản nằm trong Target users mới đăng nhập được, và TikTok không bắt xác thực URL cho Login Kit ở chế độ này.",
      steps: [
        "Trong TikTok for Developers, gạt công tắc ứng dụng sang Sandbox và mở tab Sandbox.",
        "Products → Login Kit → Redirect URI → Web: thêm đúng https://<tên-miền>/api/tiktok/callback (đăng ký riêng cho Sandbox, không dùng chung với Production).",
        "Sandbox settings → Target users → Add account: đăng nhập bằng chính tài khoản TikTok của bạn (số điện thoại hay email đều được).",
        "Dùng Client Key và Client Secret của tab Sandbox trong .env — cặp khoá phải cùng một tab.",
        "Khởi động lại máy chủ rồi bấm Kết nối TikTok.",
      ],
      caveats: [
        "Ứng dụng chưa qua kiểm duyệt chỉ đăng được ở chế độ “Chỉ mình tôi”.",
        "Tối đa 10 tài khoản Target users cho mỗi Sandbox.",
      ],
    };
  }
  if (environment === "production") {
    return {
      environment,
      label: "Production",
      summary: "Bạn đang dùng Client Key của tab Production (bắt đầu bằng “aw”). Chế độ này yêu cầu ứng dụng đã được TikTok duyệt và tên miền đã xác thực trong URL properties.",
      steps: [
        "Nếu ứng dụng chưa được TikTok duyệt, trang đăng nhập có thể báo lỗi client_key/unauthorized_client. Cách nhanh nhất: chuyển sang Sandbox.",
        "Muốn chuyển sang Sandbox: gạt công tắc sang Sandbox, mở tab Sandbox, rồi chép Client Key/Secret của tab đó (thường bắt đầu bằng “sb”).",
        "Sang Sandbox bạn phải đăng ký lại Redirect URI trong tab Sandbox và thêm tài khoản vào Target users.",
        "Nếu tiếp tục ở Production: xác thực tên miền trong URL properties (bạn đã làm) và thêm Redirect URI dưới Login Kit → Web.",
        "Sau khi TikTok duyệt ứng dụng, giữ nguyên khoá Production này.",
      ],
      caveats: [
        "Khoá Production và Sandbox là hai cặp khác nhau; trộn khoá với Redirect URI của tab còn lại sẽ gây lỗi.",
        "Đổi APP_URL (ví dụ tunnel mới) bắt buộc xác thực lại tên miền.",
      ],
    };
  }
  return {
    environment,
    label: "Chưa xác định",
    summary: "Không nhận diện được khoá thuộc tab Sandbox hay Production từ tiền tố. Hãy đối chiếu 4 ký tự đầu/cuối với trang TikTok for Developers.",
    steps: [
      "Mở TikTok for Developers → ứng dụng → ghi lại Client Key ở tab bạn đang dùng.",
      "Khoá Sandbox thường bắt đầu bằng “sb”, khoá Production bằng “aw”.",
      "Dán lại đúng khoá, không kèm dấu nháy hay xuống dòng.",
    ],
    caveats: ["Nếu không chắc, hãy dùng Sandbox để thử trước — không cần xác thực URL cho Login Kit."],
  };
}
