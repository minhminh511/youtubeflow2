import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { facebookPosts } from "@/db/schema";
import { assertSameOrigin } from "@/lib/security";
import { requireWorkspace } from "@/lib/workspace";
import { activeCredentials, deleteRemotePost, facebookErrorResponse, getOwnedPost } from "@/lib/facebook";
import { analyzeFacebook, FB_LIMITS } from "@/lib/facebook-policy";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

/** Only drafts can be edited; published or scheduled content is changed on Facebook itself. */
export async function PATCH(request: NextRequest, context: Context) {
  try {
    assertSameOrigin(request);
    const workspace = await requireWorkspace(request);
    const { id } = await context.params;
    if (!UUID.test(id)) return NextResponse.json({ error: "Mã bài viết không hợp lệ." }, { status: 400 });
    const row = await getOwnedPost(workspace.id, id);
    if (!row) return NextResponse.json({ error: "Không tìm thấy bài viết." }, { status: 404 });
    if (row.status !== "draft") return NextResponse.json({ error: "Chỉ bản nháp mới được sửa trong TubeFlow." }, { status: 409 });
    const body = (await request.json().catch(() => null)) as { message?: unknown; notes?: unknown } | null;
    const message = typeof body?.message === "string" ? body.message.trim() : row.message;
    if (message.length > FB_LIMITS.textMax) return NextResponse.json({ error: `Nội dung tối đa ${FB_LIMITS.textMax} ký tự.` }, { status: 400 });
    const report = analyzeFacebook({ kind: "text", message, hasMedia: false, width: null, height: null, seconds: null, bytes: null, scheduledAt: null, brandedAttested: false });
    const [updated] = await db.update(facebookPosts).set({
      message,
      notes: typeof body?.notes === "string" ? body.notes.slice(0, 5000) : row.notes,
      policyScore: report.score,
      policyGrade: report.grade,
      policyFindings: report.findings.map(({ id: findingId, level, area, message: text }) => ({ id: findingId, level, area, message: text })),
      updatedAt: new Date(),
    }).where(eq(facebookPosts.id, id)).returning();
    return NextResponse.json(updated);
  } catch (error) { return facebookErrorResponse(error); }
}

/**
 * Removes a draft, a failed attempt, or a scheduled post. Scheduled posts are also deleted on Facebook.
 * Published posts are deliberately refused to prevent accidental loss of live content.
 */
export async function DELETE(request: NextRequest, context: Context) {
  try {
    assertSameOrigin(request);
    const workspace = await requireWorkspace(request);
    const { id } = await context.params;
    if (!UUID.test(id)) return NextResponse.json({ error: "Mã bài viết không hợp lệ." }, { status: 400 });
    const row = await getOwnedPost(workspace.id, id);
    if (!row) return NextResponse.json({ error: "Không tìm thấy bài viết." }, { status: 404 });
    if (row.status === "published") return NextResponse.json({ error: "Bài đã đăng: xoá trực tiếp trên Facebook để tránh mất nội dung ngoài ý muốn." }, { status: 409 });
    let remoteDeleted = false;
    if (row.status === "scheduled" && row.facebookPostId) {
      try {
        const creds = await activeCredentials(workspace.id);
        await deleteRemotePost(row.facebookPostId, creds.token);
        remoteDeleted = true;
      } catch { remoteDeleted = false; }
    }
    await db.delete(facebookPosts).where(eq(facebookPosts.id, id));
    const message = row.status === "scheduled"
      ? remoteDeleted ? "Đã huỷ lịch trên Facebook và xoá khỏi TubeFlow." : "Đã xoá khỏi TubeFlow. Facebook chưa huỷ được lịch, hãy kiểm tra trong Meta Business Suite."
      : "Đã xoá khỏi TubeFlow.";
    return NextResponse.json({ ok: true, remoteDeleted, message });
  } catch (error) { return facebookErrorResponse(error); }
}
