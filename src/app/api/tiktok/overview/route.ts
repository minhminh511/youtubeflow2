import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { creatorInfo, listVideos, tiktokErrorResponse, validTokens } from "@/lib/tiktok";

export const dynamic = "force-dynamic";

/** Live creator profile settings and recent published videos from TikTok. */
export async function GET(request: NextRequest) {
  try {
    const workspace = await requireWorkspace(request);
    const tokens = await validTokens(workspace.id);
    const [creator, videos] = await Promise.all([
      creatorInfo(workspace.id).catch(() => null),
      listVideos(workspace.id, 12),
    ]);
    return NextResponse.json({ creator, videos, scopes: tokens.scope.split(/[,\s]+/).filter(Boolean) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return tiktokErrorResponse(error); }
}
