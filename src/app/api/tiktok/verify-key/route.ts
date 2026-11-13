import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/security";
import { requireWorkspace } from "@/lib/workspace";
import { verifyClientKey } from "@/lib/tiktok";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Asks TikTok whether it recognises the configured client_key.
 * Returns only masked fingerprints and TikTok's own error strings — never the key or secret.
 */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    await requireWorkspace(request);
    const result = await verifyClientKey();
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "unauthorized") return NextResponse.json({ error: "Phiên làm việc đã hết hạn. Hãy tải lại trang." }, { status: 401 });
    return NextResponse.json({ error: "Không kiểm tra được khoá TikTok." }, { status: 500 });
  }
}
