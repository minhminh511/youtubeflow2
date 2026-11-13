import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tiktokPosts } from "@/db/schema";
import { assertSameOrigin } from "@/lib/security";
import { requireWorkspace } from "@/lib/workspace";
import { publishStatus, tiktokErrorResponse } from "@/lib/tiktok";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

/**
 * Polls TikTok's Content Posting API for one submission and records the outcome.
 * TikTok reviews content asynchronously, so a submission is not the same as being live.
 */
export async function POST(request: NextRequest, context: Context) {
  try {
    assertSameOrigin(request);
    const workspace = await requireWorkspace(request);
    const { id } = await context.params;
    const [row] = await db.select().from(tiktokPosts).where(eq(tiktokPosts.id, id)).limit(1);
    if (!row || row.workspaceId !== workspace.id) return NextResponse.json({ error: "Không tìm thấy bài viết." }, { status: 404 });
    if (!row.publishId) return NextResponse.json({ error: "Bài viết này chưa được gửi lên TikTok." }, { status: 409 });

    const status = await publishStatus(workspace.id, row.publishId);
    const map: Record<string, string> = {
      PUBLISH_COMPLETE: "published",
      PUBLISH_COMPLETE_MAYBE: "published",
      SENT_TO_REVIEW: "reviewing",
      WAITING: "processing",
      PROCESSING: "processing",
      UPLOADING: "processing",
      FAILED: "failed",
    };
    const nextStatus = map[status.status] ?? "processing";
    const [updated] = await db.update(tiktokPosts).set({
      status: nextStatus,
      videoId: status.videoId ?? row.videoId,
      error: status.failReason ? status.failReason.slice(0, 500) : row.error,
      updatedAt: new Date(),
    }).where(eq(tiktokPosts.id, id)).returning();
    return NextResponse.json({ ...updated, remoteStatus: status.status });
  } catch (error) { return tiktokErrorResponse(error); }
}
