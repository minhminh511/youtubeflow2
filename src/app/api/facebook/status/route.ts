import { NextRequest, NextResponse } from "next/server";
import { apiError, requireWorkspace } from "@/lib/workspace";
import { statusFor } from "@/lib/facebook";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const workspace = await requireWorkspace(request);
    return NextResponse.json(await statusFor(workspace.id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
