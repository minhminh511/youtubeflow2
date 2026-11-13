import { NextRequest, NextResponse } from "next/server";
import { completeConnection, facebookConfig, FB_COOKIE, verifyState } from "@/lib/facebook";
import { requireWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const config = facebookConfig();
  const url = new URL(request.url);
  const back = (flag: string) => {
    const response = NextResponse.redirect(new URL(`/?view=connections&fb=${flag}`, config.appUrl));
    response.cookies.delete(FB_COOKIE);
    return response;
  };
  if (url.searchParams.get("error")) {
    return back(url.searchParams.get("error_reason") === "user_denied" ? "access_denied" : "connection_failed");
  }
  const code = url.searchParams.get("code");
  if (!code || !verifyState(request.cookies.get(FB_COOKIE)?.value, url.searchParams.get("state"))) return back("invalid_state");
  let workspaceId: string;
  try { workspaceId = (await requireWorkspace(request)).id; } catch { return back("unauthorized"); }
  try {
    const result = await completeConnection(workspaceId, code);
    if (result.pageCount === 0) return back("no_page");
    return back(result.missingScopes.length ? "partial" : "success");
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "fb_missing_config") return back("missing_config");
    return back("connection_failed");
  }
}
