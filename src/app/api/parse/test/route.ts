import { NextRequest, NextResponse } from "next/server";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import { textToGrid } from "@/lib/text-grid";
import { applyFieldRules, applyTableRule, ExtractionConfig } from "@/lib/rule-parser";

const execFileAsync = promisify(execFile);

function parseWorkHours(raw: string): number {
  const s = raw.trim();
  const hm = s.match(/^(\d+)h(\d+)$/);
  if (hm) return (parseInt(hm[1], 10) || 0) + (parseInt(hm[2], 10) || 0) / 60;
  if (s.endsWith("h")) return parseFloat(s.slice(0, -1)) || 0;
  if (s.includes(":")) {
    const [h, m] = s.split(":");
    return (parseInt(h, 10) || 0) + (parseInt(m, 10) || 0) / 60;
  }
  return parseFloat(s) || 0;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export async function POST(request: NextRequest) {
  let tempPath = "";
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const extractionJson = formData.get("extraction") as string | null;

    if (!file || !extractionJson) {
      return NextResponse.json(
        { error: "PDF 파일과 extraction 설정이 필요합니다." },
        { status: 400 }
      );
    }

    const extraction: ExtractionConfig = JSON.parse(extractionJson);

    const bytes = await file.arrayBuffer();
    tempPath = join(tmpdir(), `test-${Date.now()}.pdf`);
    await writeFile(tempPath, Buffer.from(bytes));

    const { stdout } = await execFileAsync("pdftotext", ["-layout", tempPath, "-"]);
    const grid = textToGrid(stdout);
    const allWarnings: string[] = [];

    const fieldResult = applyFieldRules(grid, extraction.fields);
    allWarnings.push(...fieldResult.warnings);

    const tableResult = applyTableRule(grid, extraction.table);
    allWarnings.push(...tableResult.warnings);

    const entries = tableResult.rows.map((row) => {
      const hoursCol = extraction.table.columns.find((c) => c.type === "hours");
      const rawHours = hoursCol ? row[hoursCol.name] || "" : "";
      const workHours = parseWorkHours(rawHours);
      const recognizedHours = workHours * 1.5;
      const recognizedDays = recognizedHours / 8;
      return {
        ...row,
        workHours: round3(workHours),
        recognizedHours: round3(recognizedHours),
        recognizedDays: round3(recognizedDays),
      };
    });

    return NextResponse.json({ fields: fieldResult.fields, entries, warnings: allWarnings });
  } catch (error) {
    console.error("Test parse error:", error);
    return NextResponse.json(
      { error: "테스트 파싱에 실패했습니다." },
      { status: 500 }
    );
  } finally {
    if (tempPath) {
      await unlink(tempPath).catch(() => {});
    }
  }
}
