/**
 * Serves TikTok's domain-ownership file.
 *
 * TikTok fetches two different paths depending on the method chosen in the portal:
 * - URL prefix: GET /tiktok<SIGNATURE>.txt   (handled by a rewrite in next.config.ts)
 * - fallback:   GET /tiktok-developers-site-verification.txt
 *
 * Both must return the exact line `tiktok-developers-site-verification=<SIGNATURE>`
 * with no BOM and no extra text. Set TIKTOK_SITE_VERIFICATION to that line (or just the
 * signature) and keep it on the server only.
 */
export const dynamic = "force-dynamic";

function signature(): string {
  const raw = (process.env.TIKTOK_SITE_VERIFICATION || "")
    .replace(/^\uFEFF/, "")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .replace(/^(['"`])(.*)\1$/, "$2")
    .trim();
  return raw.replace(/^tiktok-developers-site-verification=/i, "").trim();
}

function textResponse(body: string, status: number) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function GET() {
  const value = signature();
  if (!value) {
    return textResponse("TIKTOK_SITE_VERIFICATION chưa được cấu hình.\n", 404);
  }
  return textResponse(`tiktok-developers-site-verification=${value}`, 200);
}

/** TikTok may send HEAD; answer without a body. */
export function HEAD() {
  const value = signature();
  return new Response(null, {
    status: value ? 200 : 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
