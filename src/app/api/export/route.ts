import { NextRequest, NextResponse } from "next/server";
import { getFileById, updateFileStatus, getAllFiles, getPresetById, getDefaultPreset, PresetConfig } from "@/lib/db";
import { findFirstEmptyRow, writeToSheet, extractSpreadsheetId } from "@/lib/google-sheets";
import { OvertimeEntry } from "@/lib/pdf-parser";
import { unlink } from "fs/promises";

async function cleanupAllFiles() {
  const files = getAllFiles();
  for (const file of files) {
    try {
      await unlink(file.file_path);
    } catch {
      // File might already be deleted
    }
    updateFileStatus(file.id, "exported");
  }
}

export async function POST(request: NextRequest) {
  try {
    const { fileIds, spreadsheetId, sheetName, presetId } =
      (await request.json()) as {
        fileIds: number[];
        spreadsheetId: string;
        sheetName: string;
        presetId?: number;
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

    // Load preset
    const preset = presetId
      ? getPresetById(presetId)
      : getDefaultPreset();

    if (!preset) {
      return NextResponse.json(
        { error: "프리셋을 찾을 수 없습니다." },
        { status: 400 }
      );
    }

    const presetConfig = JSON.parse(preset.config) as PresetConfig;
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

    // Find first empty row using preset config
    const startRow = await findFirstEmptyRow(sheetId, sheetName, presetConfig);

    // Build entry records for dynamic column mapping
    const entryRecords = allEntries.map((e) => ({
      name: e.name,
      workPeriod: e.workPeriod,
      workHours: String(e.workHours),
      recognizedHours: String(e.recognizedHours),
      recognizedDays: String(e.recognizedDays),
      applicationDate: e.applicationDate,
      workContent: e.workContent,
    }));

    // Write to Google Sheet using preset column mapping
    const result = await writeToSheet(
      sheetId,
      sheetName,
      startRow,
      entryRecords,
      presetConfig
    );

    return NextResponse.json({
      success: true,
      rowCount: allEntries.length,
      startRow,
      updatedRange: result.updatedRange,
    });
  } catch (error) {
    console.error("Export error:", error);
    const message =
      error instanceof Error
        ? error.message
        : "Google Sheets 내보내기에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await cleanupAllFiles();
  }
}
