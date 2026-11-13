import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { facebookErrorResponse, pageOverview } from "@/lib/facebook";

export const dynamic = "force-dynamic";

/** Live Page statistics and recent posts from Meta. */
export async function GET(request: NextRequest) {
  try {
    const workspace = await requireWorkspace(request);
    return NextResponse.json(await pageOverview(workspace.id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return facebookErrorResponse(error); }
}
