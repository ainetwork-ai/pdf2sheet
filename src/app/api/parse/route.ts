import { NextRequest, NextResponse } from "next/server";
import { getFileById, updateFileStatus } from "@/lib/db";
import { parsePdfTable } from "@/lib/pdf-parser";

export async function POST(request: NextRequest) {
  try {
    const { fileIds } = (await request.json()) as { fileIds: number[] };

    if (!fileIds || fileIds.length === 0) {
      return NextResponse.json(
        { error: "No file IDs provided" },
        { status: 400 }
      );
    }

    const results = [];

    for (const id of fileIds) {
      const file = getFileById(id);
      if (!file) {
        results.push({ id, error: "File not found" });
        continue;
      }

      try {
        const parsedData = await parsePdfTable(file.file_path);
        updateFileStatus(id, "parsed", JSON.stringify(parsedData));

        results.push({
          id,
          originalName: file.original_name,
          headers: parsedData.headers,
          rows: parsedData.rows,
          pageCount: parsedData.pageCount,
          rowCount: parsedData.rows.length,
        });
      } catch (parseError) {
        console.error(`Parse error for file ${id}:`, parseError);
        updateFileStatus(id, "error");
        results.push({
          id,
          originalName: file.original_name,
          error: "Failed to parse PDF",
        });
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Parse error:", error);
    return NextResponse.json(
      { error: "Failed to parse files" },
      { status: 500 }
    );
  }
}
