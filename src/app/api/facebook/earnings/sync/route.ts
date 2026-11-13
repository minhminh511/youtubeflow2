import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/security";
import { requireWorkspace } from "@/lib/workspace";
import { facebookErrorResponse, syncPageEarnings } from "@/lib/facebook";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Pulls the last 28 days of Monetization metrics from Meta for the active Page. */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const workspace = await requireWorkspace(request);
    const result = await syncPageEarnings(workspace.id);
    const message = result.errors.length === 0
      ? `Đã đồng bộ ${result.synced} mốc doanh thu từ Meta.`
      : result.synced > 0
        ? `Đồng bộ một phần: ${result.synced} mốc. Một số chỉ số chưa có dữ liệu cho Trang này.`
        : "Meta chưa trả dữ liệu kiếm tiền cho Trang này. Trang cần đủ điều kiện kiếm tiền và bạn cần là Quản trị viên. Bạn vẫn có thể nhập CSV hoặc nhập tay.";
    return NextResponse.json({ ...result, message });
  } catch (error) { return facebookErrorResponse(error); }
}
