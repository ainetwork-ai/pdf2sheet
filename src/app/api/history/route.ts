import { NextRequest, NextResponse } from "next/server";
import { getAllHistorySessions, appendHistorySession } from "@/lib/db";
import type { ParsedResult } from "@/lib/shared-types";

export async function GET() {
  try {
    const sessions = getAllHistorySessions();
    return NextResponse.json({ sessions });
  } catch (error) {
    console.error("History GET error:", error);
    return NextResponse.json({ error: "히스토리 조회 실패" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { results } = (await request.json()) as { results: ParsedResult[] };
    const session = appendHistorySession(results);
    return NextResponse.json({ id: session.id });
  } catch (error) {
    console.error("History POST error:", error);
    return NextResponse.json({ error: "히스토리 저장 실패" }, { status: 500 });
  }
}
