import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { tiktokPosts } from "@/db/schema";
import { assertSameOrigin } from "@/lib/security";
import { requireWorkspace } from "@/lib/workspace";
import { tiktokErrorResponse } from "@/lib/tiktok";
import { analyzeTikTok, TK_LIMITS } from "@/lib/tiktok-policy";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

async function owned(workspaceId: string, id: string) {
  const [row] = await db.select().from(tiktokPosts).where(and(eq(tiktokPosts.id, id), eq(tiktokPosts.workspaceId, workspaceId))).limit(1);
  return row || null;
}

/** Only drafts are editable; submitted posts are changed inside TikTok. */
export async function PATCH(request: NextRequest, context: Context) {
  try {
    assertSameOrigin(request);
    const workspace = await requireWorkspace(request);
    const { id } = await context.params;
    if (!UUID.test(id)) return NextResponse.json({ error: "Mã bài viết không hợp lệ." }, { status: 400 });
    const row = await owned(workspace.id, id);
    if (!row) return NextResponse.json({ error: "Không tìm thấy bài viết." }, { status: 404 });
    if (row.status !== "draft") return NextResponse.json({ error: "Chỉ bản nháp mới được sửa trong TubeFlow." }, { status: 409 });
    const body = (await request.json().catch(() => null)) as { title?: unknown; notes?: unknown } | null;
    const title = typeof body?.title === "string" ? body.title.trim() : row.title;
    if (title.length > TK_LIMITS.titleMax) return NextResponse.json({ error: `Chú thích tối đa ${TK_LIMITS.titleMax} ký tự.` }, { status: 400 });
    const report = analyzeTikTok({
      title, privacyLevel: "SELF_ONLY", hasMedia: false, width: null, height: null,
      seconds: null, bytes: null, disableComment: false, disableDuet: false, disableStitch: false,
    });
    const [updated] = await db.update(tiktokPosts).set({
      title,
      notes: typeof body?.notes === "string" ? body.notes.slice(0, 5000) : row.notes,
      policyScore: report.score,
      policyGrade: report.grade,
      policyFindings: report.findings.map(({ id: findingId, level, area, message }) => ({ id: findingId, level, area, message })),
      updatedAt: new Date(),
    }).where(eq(tiktokPosts.id, id)).returning();
    return NextResponse.json(updated);
  } catch (error) { return tiktokErrorResponse(error); }
}

/** Removes a draft or a failed attempt. Submitted posts stay in TikTok. */
export async function DELETE(request: NextRequest, context: Context) {
  try {
    assertSameOrigin(request);
    const workspace = await requireWorkspace(request);
    const { id } = await context.params;
    if (!UUID.test(id)) return NextResponse.json({ error: "Mã bài viết không hợp lệ." }, { status: 400 });
    const row = await owned(workspace.id, id);
    if (!row) return NextResponse.json({ error: "Không tìm thấy bài viết." }, { status: 404 });
    if (row.status === "published") return NextResponse.json({ error: "Video đã đăng trên TikTok: hãy xoá trực tiếp trong ứng dụng TikTok." }, { status: 409 });
    await db.delete(tiktokPosts).where(and(eq(tiktokPosts.id, id), eq(tiktokPosts.workspaceId, workspace.id)));
    return NextResponse.json({ ok: true, message: "Đã xoá mục này khỏi TubeFlow." });
  } catch (error) { return tiktokErrorResponse(error); }
}
