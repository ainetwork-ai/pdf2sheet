import { NextRequest, NextResponse } from "next/server";
import { getFileById, updateFileStatus } from "@/lib/db";
import { appendToSheet, getLastRowNumber, extractSpreadsheetId } from "@/lib/google-sheets";
import { OvertimeEntry, toSheetRow } from "@/lib/pdf-parser";
import { unlink } from "fs/promises";

export async function POST(request: NextRequest) {
  try {
    const { fileIds, spreadsheetId, sheetName } = (await request.json()) as {
      fileIds: number[];
      spreadsheetId: string;
      sheetName: string;
    };

    if (!spreadsheetId || !sheetName) {
      return NextResponse.json(
        { error: "스프레드시트 ID와 시트 이름을 입력하세요." },
        { status: 400 }
      );
    }

    if (!fileIds || fileIds.length === 0) {
      return NextResponse.json(
        { error: "파일이 선택되지 않았습니다." },
        { status: 400 }
      );
    }

    const sheetId = extractSpreadsheetId(spreadsheetId);

    // Collect all entries from parsed files
    const allEntries: OvertimeEntry[] = [];

    for (const id of fileIds) {
      const file = getFileById(id);
      if (!file?.parsed_data) continue;

      const parsedData = JSON.parse(file.parsed_data);
      allEntries.push(...parsedData.entries);
    }

    if (allEntries.length === 0) {
      return NextResponse.json(
        { error: "내보낼 데이터가 없습니다." },
        { status: 400 }
      );
    }

    // Get last row number for auto-increment
    const lastRowNumber = await getLastRowNumber(sheetId, sheetName);

    // Build sheet rows with auto-incremented 연번
    const sheetRows = allEntries.map((entry, idx) =>
      toSheetRow(entry, lastRowNumber + idx + 1)
    );

    // Append to Google Sheet
    const result = await appendToSheet(sheetId, sheetName, sheetRows);

    // Clean up: delete PDF files and update status
    for (const id of fileIds) {
      const file = getFileById(id);
      if (file) {
        try {
          await unlink(file.file_path);
        } catch {
          // File might already be deleted
        }
        updateFileStatus(id, "exported");
      }
    }

    return NextResponse.json({
      success: true,
      rowCount: allEntries.length,
      startNumber: lastRowNumber + 1,
      updatedRange: result.updatedRange,
    });
  } catch (error) {
    console.error("Export error:", error);
    const message =
      error instanceof Error
        ? error.message
        : "Google Sheets 내보내기에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
