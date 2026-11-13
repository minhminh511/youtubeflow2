import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/security";
import { apiError, requireWorkspace } from "@/lib/workspace";
import { disconnectTikTok } from "@/lib/tiktok";

export const dynamic = "force-dynamic";

/** Removes TikTok tokens from TubeFlow. Videos already on TikTok are untouched. */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const workspace = await requireWorkspace(request);
    await disconnectTikTok(workspace.id);
    return NextResponse.json({ ok: true, message: "Đã ngắt kết nối và xoá token TikTok khỏi TubeFlow. Video đã đăng trên TikTok vẫn được giữ nguyên." });
  } catch (error) { return apiError(error); }
}
