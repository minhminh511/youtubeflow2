import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/security";
import { apiError, requireWorkspace } from "@/lib/workspace";
import { facebookErrorResponse, setActivePage, statusFor } from "@/lib/facebook";

export const dynamic = "force-dynamic";

/** Switches the Page that TubeFlow publishes to and reads from. */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const workspace = await requireWorkspace(request);
    const body = (await request.json().catch(() => null)) as { pageId?: unknown } | null;
    const pageId = typeof body?.pageId === "string" ? body.pageId.trim() : "";
    if (!/^\d{5,25}$/.test(pageId)) return NextResponse.json({ error: "Mã Trang không hợp lệ." }, { status: 400 });
    await setActivePage(workspace.id, pageId);
    return NextResponse.json(await statusFor(workspace.id));
  } catch (error) {
    if (error instanceof Error && error.message === "fb_no_page") return NextResponse.json({ error: "Trang này không nằm trong danh sách đã kết nối." }, { status: 404 });
    return facebookErrorResponse(error);
  }
}
