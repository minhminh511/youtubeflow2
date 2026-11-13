import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { facebookPosts } from "@/db/schema";
import { assertSameOrigin } from "@/lib/security";
import { requireWorkspace } from "@/lib/workspace";
import { activeCredentials, facebookErrorResponse, listPosts, publishToPage } from "@/lib/facebook";
import { analyzeFacebook, FB_KINDS, FB_LIMITS, type FbKind } from "@/lib/facebook-policy";

export const dynamic = "force-dynamic";
export const maxDuration = 900;

export async function GET(request: NextRequest) {
  try {
    const workspace = await requireWorkspace(request);
    return NextResponse.json(await listPosts(workspace.id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return facebookErrorResponse(error); }
}

/**
 * mode = draft | publish | schedule. Policy blockers stop publish and schedule on the server too,
 * so a stale browser tab cannot bypass the checks.
 */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const workspace = await requireWorkspace(request);
    const form = await request.formData();
    const mode = String(form.get("mode") || "publish");
    if (!["draft", "publish", "schedule"].includes(mode)) return NextResponse.json({ error: "Chế độ đăng không hợp lệ." }, { status: 400 });
    const kind = String(form.get("kind") || "text") as FbKind;
    if (!FB_KINDS.includes(kind)) return NextResponse.json({ error: "Loại nội dung không hợp lệ." }, { status: 400 });
    const message = String(form.get("message") || "").trim();
    if (message.length > FB_LIMITS.textMax) return NextResponse.json({ error: `Nội dung tối đa ${FB_LIMITS.textMax} ký tự.` }, { status: 400 });
    const file = form.get("file");
    const media = file instanceof File && file.size > 0 ? file : null;
    if (media && media.size > FB_LIMITS.mediaBytes) return NextResponse.json({ error: "Tệp vượt 1GB." }, { status: 400 });
    const scheduledRaw = String(form.get("scheduledAt") || "");
    const scheduledAt = scheduledRaw ? new Date(scheduledRaw) : null;
    if (scheduledAt && Number.isNaN(scheduledAt.getTime())) return NextResponse.json({ error: "Thời gian lên lịch không hợp lệ." }, { status: 400 });
    const numberOf = (key: string) => { const value = Number(form.get(key)); return Number.isFinite(value) && value > 0 ? value : null; };
    const brandedAttested = String(form.get("brandedAttested") || "") === "1";
    const notes = String(form.get("notes") || "").slice(0, 5000);

    if (mode === "draft" && kind !== "text") return NextResponse.json({ error: "Bản nháp chỉ lưu văn bản. Ảnh và video cần đăng hoặc lên lịch ngay." }, { status: 400 });
    if (mode === "schedule" && !scheduledAt) return NextResponse.json({ error: "Chọn thời gian để lên lịch." }, { status: 400 });
    if (mode === "publish" && scheduledAt) return NextResponse.json({ error: "Có thời gian lên lịch nhưng chưa chọn Lên lịch." }, { status: 400 });

    const report = analyzeFacebook({
      kind, message, hasMedia: !!media, width: numberOf("width"), height: numberOf("height"),
      seconds: numberOf("seconds"), bytes: media?.size ?? null, scheduledAt, brandedAttested,
    });
    if (mode !== "draft" && !report.readyToPublish) {
      return NextResponse.json({ error: "Nội dung còn lỗi chặn theo chính sách. Hãy sửa trước khi đăng.", findings: report.blockers }, { status: 422 });
    }

    const base = {
      workspaceId: workspace.id,
      kind,
      message,
      mediaName: media?.name ?? null,
      mediaBytes: media?.size ?? null,
      scheduledAt,
      policyScore: report.score,
      policyGrade: report.grade,
      policyFindings: report.findings.map(({ id, level, area, message: text }) => ({ id, level, area, message: text })),
      notes,
    };

    if (mode === "draft") {
      const [row] = await db.insert(facebookPosts).values({ ...base, pageId: "", status: "draft" }).returning();
      return NextResponse.json(row, { status: 201 });
    }

    if (kind !== "text" && !media) return NextResponse.json({ error: "Hãy chọn tệp ảnh hoặc video cho loại nội dung này." }, { status: 400 });
    const creds = await activeCredentials(workspace.id);
    if (!creds.canPublish) return NextResponse.json({ error: "Tài khoản của bạn chưa có quyền tạo nội dung trên Trang này (cần Quản trị viên hoặc Biên tập viên)." }, { status: 403 });

    try {
      const result = await publishToPage({
        pageId: creds.pageId,
        token: creds.token,
        kind,
        message,
        file: media,
        scheduledUnix: scheduledAt ? Math.floor(scheduledAt.getTime() / 1000) : null,
      });
      const [row] = await db.insert(facebookPosts).values({
        ...base,
        pageId: creds.pageId,
        pageName: creds.pageName,
        status: mode === "schedule" ? "scheduled" : "published",
        publishedAt: mode === "publish" ? new Date() : null,
        facebookPostId: result.id,
        permalink: result.permalink,
      }).returning();
      return NextResponse.json(row, { status: 201 });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown";
      await db.insert(facebookPosts).values({ ...base, pageId: creds.pageId, pageName: creds.pageName, status: "failed", error: reason.slice(0, 500) });
      return facebookErrorResponse(error);
    }
  } catch (error) { return facebookErrorResponse(error); }
}
