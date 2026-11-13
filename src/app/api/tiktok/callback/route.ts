import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { completeConnection, TikTokError, TIKTOK_COOKIE, tiktokConfig, verifyState } from "@/lib/tiktok";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const config = tiktokConfig();
  const back = (flag: string) => {
    const response = NextResponse.redirect(new URL(`/?view=connections&tt=${flag}`, config.appUrl));
    response.cookies.delete(TIKTOK_COOKIE);
    return response;
  };
  const url = new URL(request.url);
  const errorCode = url.searchParams.get("error") || url.searchParams.get("error_type") || url.searchParams.get("errCode");
  if (errorCode) {
    const description = url.searchParams.get("error_description") || url.searchParams.get("error_message") || "";
    const denied = /access_denied|user_cancelled_authorize|cancelled/i.test(`${errorCode} ${description}`);
    const flag = denied ? "access_denied" : "connection_failed";
    // Keep TikTok's own wording so the user can see exactly what it objected to.
    const detail = [errorCode, description].filter(Boolean).join(" · ").slice(0, 300);
    const response = NextResponse.redirect(new URL(`/?view=connections&tt=${flag}${detail ? `&tt_detail=${encodeURIComponent(detail)}` : ""}`, config.appUrl));
    response.cookies.delete(TIKTOK_COOKIE);
    return response;
  }
  const rawCode = url.searchParams.get("code") ?? "";
  // url.searchParams decodes "+" as a space. Authorisation codes never contain spaces, so a space
  // means the original character was "+" and must be restored before the token exchange.
  const hadSpace = rawCode.includes(" ");
  const code = hadSpace ? rawCode.replace(/ /g, "+") : rawCode;
  if (!code || !verifyState(request.cookies.get(TIKTOK_COOKIE)?.value, url.searchParams.get("state"))) return back("invalid_state");
  let workspaceId: string;
  try { workspaceId = (await requireWorkspace(request)).id; } catch { return back("unauthorized"); }
  try {
    const result = await completeConnection(workspaceId, code);
    return back(result.missingScopes.length ? "partial" : "success");
  } catch (error) {
    // Surface TikTok's own wording plus what we actually sent, masked. A generic message gives the
    // user nothing to act on, and "malformed" is not the same problem as "code rejected".
    const detail = error instanceof Error ? error.message : "unknown";
    const lower = detail.toLowerCase();
    const codeRejected = /invalid_grant|invalid_code|authorization code|code (has )?expired|code was already used/.test(lower);
    const malformed = /malformed|invalid_request/.test(lower) && !codeRejected;
    const flag = codeRejected ? "code_rejected" : malformed ? "params_malformed" : "connection_failed";
    const trace = [
      `code=${code.length} ký tự${hadSpace ? " (đã khôi phục dấu +)" : ""}`,
      `redirect_uri=${config.redirectUri}`,
      `scope=${config.scopes.join(",")}`,
      `key=${config.diagnosis.keyPrefix || "?"}…`,
    ].join(" · ");
    const response = back(flag);
    const location = response.headers.get("location");
    if (location) {
      const target = new URL(location);
      target.searchParams.set("tt_detail", `${detail} — ${trace}`.slice(0, 500));
      return NextResponse.redirect(target);
    }
    return response;
  }
}
