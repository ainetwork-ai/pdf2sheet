import { NextRequest, NextResponse } from "next/server";
import { getFileById, updateFileStatus } from "@/lib/db";
import { appendToSheet } from "@/lib/google-sheets";
import { unlink } from "fs/promises";

export async function POST(request: NextRequest) {
  try {
    const { fileIds, spreadsheetId, sheetName, includeHeaders } =
      (await request.json()) as {
        fileIds: number[];
        spreadsheetId: string;
        sheetName: string;
        includeHeaders: boolean;
      };

    if (!spreadsheetId || !sheetName) {
      return NextResponse.json(
        { error: "Spreadsheet ID and sheet name are required" },
        { status: 400 }
      );
    }

    if (!fileIds || fileIds.length === 0) {
      return NextResponse.json(
        { error: "No file IDs provided" },
        { status: 400 }
      );
    }

    // Collect all parsed data
    let allHeaders: string[] = [];
    const allRows: string[][] = [];

    for (const id of fileIds) {
      const file = getFileById(id);
      if (!file?.parsed_data) continue;

      const parsedData = JSON.parse(file.parsed_data);
      if (allHeaders.length === 0 && parsedData.headers) {
        allHeaders = parsedData.headers;
      }
      allRows.push(...parsedData.rows);
    }

    if (allRows.length === 0) {
      return NextResponse.json(
        { error: "No parsed data to export" },
        { status: 400 }
      );
    }

    // Append to Google Sheet
    const result = await appendToSheet(
      spreadsheetId,
      sheetName,
      allRows,
      includeHeaders,
      allHeaders
    );

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
      rowCount: allRows.length,
      updatedRange: result.updatedRange,
    });
  } catch (error) {
    console.error("Export error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to export to Google Sheets";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
