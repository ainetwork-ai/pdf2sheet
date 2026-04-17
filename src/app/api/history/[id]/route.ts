import { NextRequest, NextResponse } from "next/server";
import { getHistorySession } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = getHistorySession(id);
    if (!session) {
      return NextResponse.json(
        { error: "세션을 찾을 수 없습니다" },
        { status: 404 }
      );
    }
    return NextResponse.json({ session });
  } catch (error) {
    console.error("History [id] GET error:", error);
    return NextResponse.json({ error: "히스토리 조회 실패" }, { status: 500 });
  }
}
