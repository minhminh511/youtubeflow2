import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { facebookEarnings } from "@/db/schema";
import { assertSameOrigin } from "@/lib/security";
import { apiError, requireWorkspace } from "@/lib/workspace";
import { getFacebookConnection, facebookErrorResponse } from "@/lib/facebook";
import { isValidAmount, isValidDate, normalizeIsoDate } from "@/lib/facebook-policy";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const workspace = await requireWorkspace(request);
    const entries = await db.select().from(facebookEarnings).where(eq(facebookEarnings.workspaceId, workspace.id)).orderBy(desc(facebookEarnings.periodStart), desc(facebookEarnings.createdAt)).limit(400);
    const connection = await getFacebookConnection(workspace.id);
    const byMonth = new Map<string, number>();
    const bySource = new Map<string, number>();
    let total = 0;
    for (const entry of entries) {
      const amount = Number(entry.amount) || 0;
      total += amount;
      const month = entry.periodStart.slice(0, 7);
      byMonth.set(month, (byMonth.get(month) ?? 0) + amount);
      bySource.set(entry.source, (bySource.get(entry.source) ?? 0) + amount);
    }
    return NextResponse.json({
      entries,
      summary: {
        total: total.toFixed(2),
        byMonth: [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([month, amount]) => ({ month, amount: amount.toFixed(2) })),
        bySource: [...bySource.entries()].map(([source, amount]) => ({ source, amount: amount.toFixed(2) })),
      },
      syncedAt: connection?.earningsSyncedAt?.toISOString() ?? null,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return facebookErrorResponse(error); }
}

/** Manual entry for figures copied from Meta's monetization page. */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const workspace = await requireWorkspace(request);
    const body = (await request.json().catch(() => null)) as { date?: unknown; amount?: unknown; currency?: unknown; source?: unknown; note?: unknown } | null;
    const date = typeof body?.date === "string" ? body.date : "";
    const amount = typeof body?.amount === "string" ? body.amount.replace(/\s/g, "") : String(body?.amount ?? "");
    if (!isValidDate(date)) return NextResponse.json({ error: "Ngày không hợp lệ (YYYY-MM-DD)." }, { status: 400 });
    if (!isValidAmount(amount)) return NextResponse.json({ error: "Số tiền không hợp lệ. Dùng dấu chấm cho phần thập phân, ví dụ 125.50." }, { status: 400 });
    const iso = normalizeIsoDate(date)!;
    const currency = typeof body?.currency === "string" && /^[A-Z]{3}$/.test(body.currency.toUpperCase()) ? body.currency.toUpperCase() : "USD";
    const connection = await getFacebookConnection(workspace.id);
    const [row] = await db.insert(facebookEarnings).values({
      workspaceId: workspace.id,
      pageId: connection?.activePageId ?? "",
      periodStart: iso,
      periodEnd: iso,
      metric: "manual",
      source: "manual",
      amount,
      currency,
      note: (typeof body?.note === "string" ? body.note : "").slice(0, 300),
      externalKey: null,
    }).returning();
    return NextResponse.json(row, { status: 201 });
  } catch (error) { return apiError(error); }
}
