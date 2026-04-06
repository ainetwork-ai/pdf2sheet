import { NextRequest, NextResponse } from "next/server";
import { getFileById, updateFileStatus } from "@/lib/db";
import { parsePdfTable } from "@/lib/pdf-parser";

export async function POST(request: NextRequest) {
  try {
    const { fileIds } = (await request.json()) as { fileIds: number[] };

    if (!fileIds || fileIds.length === 0) {
      return NextResponse.json(
        { error: "파일 ID가 없습니다." },
        { status: 400 }
      );
    }

    const results = [];

    for (const id of fileIds) {
      const file = getFileById(id);
      if (!file) {
        results.push({ id, error: "파일을 찾을 수 없습니다." });
        continue;
      }

      try {
        const parsedData = await parsePdfTable(file.file_path, file.original_name);
        updateFileStatus(id, "parsed", JSON.stringify(parsedData));

        results.push({
          id,
          originalName: file.original_name,
          applicantName: parsedData.applicantName,
          applicationDate: parsedData.applicationDate,
          entries: parsedData.entries,
          entryCount: parsedData.entries.length,
          warnings: parsedData.warnings,
        });
      } catch (parseError) {
        console.error(`Parse error for file ${id}:`, parseError);
        updateFileStatus(id, "error");
        results.push({
          id,
          originalName: file.original_name,
          error:
            parseError instanceof Error
              ? parseError.message
              : "PDF 파싱에 실패했습니다.",
        });
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Parse error:", error);
    return NextResponse.json(
      { error: "파싱에 실패했습니다." },
      { status: 500 }
    );
  }
}
