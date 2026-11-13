import { NextRequest, NextResponse } from "next/server";
import { facebookConfig, FB_COOKIE, oauthDialogUrl, randomState } from "@/lib/facebook";
import { requireWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/** Starts Facebook Login. The state cookie binds the callback to the browser that started it. */
export async function GET(request: NextRequest) {
  const config = facebookConfig();
  const back = (flag: string) => NextResponse.redirect(new URL(`/?view=connections&fb=${flag}`, config.appUrl));
  try { await requireWorkspace(request); } catch { return back("unauthorized"); }
  if (!config.ready) return back("missing_config");
  const state = randomState();
  const response = NextResponse.redirect(oauthDialogUrl(state));
  response.cookies.set(FB_COOKIE, state, { httpOnly: true, secure: config.secure, sameSite: "lax", path: "/", maxAge: 600 });
  return response;
}
