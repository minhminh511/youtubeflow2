import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { randomState, TIKTOK_COOKIE, tiktokConfig, tiktokDialogUrl } from "@/lib/tiktok";

export const dynamic = "force-dynamic";

/** Starts TikTok Login Kit. The state cookie binds the callback to this browser. */
export async function GET(request: NextRequest) {
  const config = tiktokConfig();
  const back = (flag: string) => NextResponse.redirect(new URL(`/?view=connections&tt=${flag}`, config.appUrl));
  try { await requireWorkspace(request); } catch { return back("unauthorized"); }
  if (!config.ready) {
    // Distinguish "nothing configured" from "configured but TikTok will reject the client_key".
    return back(config.diagnosis.clientKey.present || config.diagnosis.clientSecret.present ? "invalid_client_key" : "missing_config");
  }
  const state = randomState();
  const response = NextResponse.redirect(tiktokDialogUrl(state));
  response.cookies.set(TIKTOK_COOKIE, state, { httpOnly: true, secure: config.appUrl.startsWith("https:"), sameSite: "lax", path: "/", maxAge: 600 });
  return response;
}
