import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { plans } from "@/db/schema";
import { assertSameOrigin } from "@/lib/security";
import { apiError, requireWorkspace } from "@/lib/workspace";
import { buildFacebookAssistant, analyzeFacebook, type FbKind, FB_KINDS } from "@/lib/facebook-policy";

export const dynamic = "force-dynamic";

/**
 * Moves content from Facebook to YouTube: creates a YouTube-ready plan with a title, description and tags
 * adapted from the Facebook text. The client then opens YouTube Studio's upload form with that plan.
 */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const workspace = await requireWorkspace(request);
    const body = (await request.json().catch(() => null)) as { message?: unknown; kind?: unknown; pageName?: unknown } | null;
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    const kind = (FB_KINDS.includes(body?.kind as FbKind) ? body?.kind : "video") as FbKind;
    const pageName = typeof body?.pageName === "string" && body.pageName.trim() ? body.pageName.trim().slice(0, 80) : "Trang Facebook";
    if (!message) return NextResponse.json({ error: "Nội dung Facebook đang trống, không có gì để chuyển sang YouTube." }, { status: 400 });
    const draft = { kind, message, hasMedia: true, width: null, height: null, seconds: null, bytes: null, scheduledAt: null, brandedAttested: false };
    const report = analyzeFacebook(draft);
    const assistant = buildFacebookAssistant(draft, report, pageName);
    const [plan] = await db.insert(plans).values({
      workspaceId: workspace.id,
      title: assistant.youtube.title.slice(0, 200),
      description: `${assistant.youtube.description}\n\n--- Chuyển từ Facebook (${kind}) ---\n${assistant.notes}`.slice(0, 5000),
      format: kind === "reel" ? "short" : "video",
      status: "idea",
    }).returning({ id: plans.id, title: plans.title });
    return NextResponse.json({ planId: plan.id, title: plan.title, tags: assistant.youtube.tags }, { status: 201 });
  } catch (error) { return apiError(error); }
}
