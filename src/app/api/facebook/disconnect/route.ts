import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/security";
import { apiError, requireWorkspace } from "@/lib/workspace";
import { disconnectFacebook } from "@/lib/facebook";

export const dynamic = "force-dynamic";

/** Removes stored Facebook tokens from TubeFlow. Posts already on Facebook are not touched. */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const workspace = await requireWorkspace(request);
    await disconnectFacebook(workspace.id);
    return NextResponse.json({ ok: true, message: "Đã ngắt kết nối và xoá token khỏi TubeFlow. Bài đã đăng trên Facebook vẫn được giữ nguyên." });
  } catch (error) { return apiError(error); }
}
