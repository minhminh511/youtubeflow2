import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { tiktokPosts } from "@/db/schema";
import { assertSameOrigin } from "@/lib/security";
import { requireWorkspace } from "@/lib/workspace";
import { getTikTokConnection, listPosts, publishVideo, tiktokErrorResponse } from "@/lib/tiktok";
import { analyzeTikTok, TK_LIMITS, type TkPrivacy } from "@/lib/tiktok-policy";

export const dynamic = "force-dynamic";
export const maxDuration = 900;

const PRIVACY: TkPrivacy[] = ["SELF_ONLY", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "PUBLIC_TO_EVERYONE"];

export async function GET(request: NextRequest) {
  try {
    const workspace = await requireWorkspace(request);
    return NextResponse.json(await listPosts(workspace.id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return tiktokErrorResponse(error); }
}

/**
 * mode = draft | direct | inbox.
 * Policy blockers stop direct/inbox submission on the server as well as in the browser.
 */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const workspace = await requireWorkspace(request);
    const form = await request.formData();
    const mode = String(form.get("mode") || "direct");
    if (!["draft", "direct", "inbox"].includes(mode)) return NextResponse.json({ error: "Chế độ đăng không hợp lệ." }, { status: 400 });
    const title = String(form.get("title") || "").trim();
    if (title.length > TK_LIMITS.titleMax) return NextResponse.json({ error: `Chú thích tối đa ${TK_LIMITS.titleMax} ký tự.`, }, { status: 400 });
    const privacyLevel = (PRIVACY.includes(String(form.get("privacyLevel")) as TkPrivacy) ? String(form.get("privacyLevel")) : "SELF_ONLY") as TkPrivacy;
    const disableComment = String(form.get("disableComment") || "") === "1";
    const disableDuet = String(form.get("disableDuet") || "") === "1";
    const disableStitch = String(form.get("disableStitch") || "") === "1";
    const coverTimestampMs = Math.max(0, Number(form.get("coverTimestampMs") ?? 1000) || 1000);
    const notes = String(form.get("notes") || "").slice(0, 5000);
    const file = form.get("file");
    const media = file instanceof File && file.size > 0 ? file : null;
    const rawDuration = form.get("mediaDuration");
    const parsedDuration = Number(rawDuration);
    const mediaDuration = rawDuration && Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : null;

    const report = analyzeTikTok({
      title,
      privacyLevel,
      hasMedia: !!media,
      width: Number(form.get("width")) || null,
      height: Number(form.get("height")) || null,
      seconds: mediaDuration,
      bytes: media?.size ?? null,
      disableComment,
      disableDuet,
      disableStitch,
    });

    if (mode === "draft" && !title) return NextResponse.json({ error: "Bản nháp cần có chú thích." }, { status: 400 });
    if (mode !== "draft" && !report.readyToPublish) {
      return NextResponse.json({ error: "Nội dung còn lỗi chặn theo Nguyên tắc cộng đồng. Hãy sửa trước khi đăng.", findings: report.blockers }, { status: 422 });
    }

    const base = {
      workspaceId: workspace.id,
      mode: mode === "inbox" ? "inbox" : "direct",
      title,
      privacyLevel,
      disableComment,
      disableDuet,
      disableStitch,
      coverTimestampMs,
      mediaName: media?.name ?? null,
      mediaBytes: media?.size ?? null,
      mediaDuration,
      policyScore: report.score,
      policyGrade: report.grade,
      policyFindings: report.findings.map(({ id, level, area, message }) => ({ id, level, area, message })),
      notes,
    };

    if (mode === "draft") {
      const [row] = await db.insert(tiktokPosts).values({ ...base, status: "draft" }).returning();
      return NextResponse.json(row, { status: 201 });
    }
    if (!media) return NextResponse.json({ error: "Hãy chọn file video để đăng." }, { status: 400 });

    const connection = await getTikTokConnection(workspace.id);
    const openId = connection?.openId ?? "";
    try {
      const result = await publishVideo(workspace.id, {
        mode: mode === "inbox" ? "inbox" : "direct",
        title,
        privacyLevel,
        disableComment,
        disableDuet,
        disableStitch,
        coverTimestampMs,
        file: media,
      });
      const [row] = await db.insert(tiktokPosts).values({
        ...base,
        openId,
        status: "submitted",
        publishId: result.publishId,
      }).returning();
      return NextResponse.json(row, { status: 201 });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown";
      await db.insert(tiktokPosts).values({ ...base, openId, status: "failed", error: reason.slice(0, 500) });
      return tiktokErrorResponse(error);
    }
  } catch (error) { return tiktokErrorResponse(error); }
}
