import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { db } from "@/db";
import { facebookEarnings } from "@/db/schema";
import { assertSameOrigin } from "@/lib/security";
import { apiError, requireWorkspace } from "@/lib/workspace";
import { getFacebookConnection, facebookErrorResponse } from "@/lib/facebook";
import { parseEarningsCsv } from "@/lib/facebook-policy";

export const dynamic = "force-dynamic";

/** Imports a CSV exported from Meta Business Suite or a spreadsheet. Re-importing the same rows is safe. */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const workspace = await requireWorkspace(request);
    const body = (await request.json().catch(() => null)) as { csv?: unknown } | null;
    const csv = typeof body?.csv === "string" ? body.csv : "";
    if (!csv.trim()) return NextResponse.json({ error: "Dán nội dung CSV hoặc chọn tệp trước khi nhập." }, { status: 400 });
    if (csv.length > 200_000) return NextResponse.json({ error: "Tệp quá lớn (tối đa khoảng 200 KB)." }, { status: 400 });
    const { rows, errors } = parseEarningsCsv(csv);
    if (rows.length === 0) return NextResponse.json({ error: "Không có dòng hợp lệ để nhập.", errors }, { status: 422 });
    const connection = await getFacebookConnection(workspace.id);
    let inserted = 0;
    for (const row of rows) {
      const externalKey = `csv:${createHash("sha256").update(`${row.date}|${row.amount}|${row.currency}|${row.source}|${row.note}`).digest("hex")}`;
      const result = await db.insert(facebookEarnings).values({
        workspaceId: workspace.id,
        pageId: connection?.activePageId ?? "",
        periodStart: row.date,
        periodEnd: row.date,
        metric: "csv",
        source: "csv_import",
        amount: row.amount,
        currency: row.currency,
        note: `${row.source}${row.note ? ` · ${row.note}` : ""}`.slice(0, 300),
        externalKey,
      }).onConflictDoNothing({ target: [facebookEarnings.workspaceId, facebookEarnings.externalKey] }).returning({ id: facebookEarnings.id });
      inserted += result.length;
    }
    return NextResponse.json({ inserted, skipped: rows.length - inserted, errors }, { status: 201 });
  } catch (error) { return facebookErrorResponse(error); }
}
