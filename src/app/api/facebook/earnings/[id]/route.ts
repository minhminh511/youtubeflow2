import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { facebookEarnings } from "@/db/schema";
import { assertSameOrigin } from "@/lib/security";
import { requireWorkspace } from "@/lib/workspace";
import { facebookErrorResponse } from "@/lib/facebook";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

/** Removes one earnings record. Figures synced from Meta can be removed too; the next sync restores them. */
export async function DELETE(request: NextRequest, context: Context) {
  try {
    assertSameOrigin(request);
    const workspace = await requireWorkspace(request);
    const { id } = await context.params;
    if (!UUID.test(id)) return NextResponse.json({ error: "Mã bản ghi không hợp lệ." }, { status: 400 });
    const [removed] = await db.delete(facebookEarnings).where(and(eq(facebookEarnings.id, id), eq(facebookEarnings.workspaceId, workspace.id))).returning({ id: facebookEarnings.id });
    if (!removed) return NextResponse.json({ error: "Không tìm thấy bản ghi." }, { status: 404 });
    return NextResponse.json({ ok: true, deleted: removed.id });
  } catch (error) { return facebookErrorResponse(error); }
}
