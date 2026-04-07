import { NextRequest, NextResponse } from "next/server";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import { parseTsv } from "@/lib/tsv-parser";

const execFileAsync = promisify(execFile);

export async function POST(request: NextRequest) {
  let tempPath = "";
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "PDF 파일이 없습니다." },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    tempPath = join(tmpdir(), `preview-${Date.now()}.pdf`);
    await writeFile(tempPath, Buffer.from(bytes));

    const { stdout } = await execFileAsync("pdftotext", ["-tsv", tempPath, "-"]);
    const result = parseTsv(stdout);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Preview error:", error);
    return NextResponse.json(
      { error: "PDF 텍스트 추출에 실패했습니다." },
      { status: 500 }
    );
  } finally {
    if (tempPath) {
      await unlink(tempPath).catch(() => {});
    }
  }
}
