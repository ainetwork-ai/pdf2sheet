import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface OvertimeEntry {
  documentNumber: string;
  name: string;
  workPeriod: string;
  workHours: number;
  recognizedHours: number;
  recognizedDays: number;
  applicationDate: string;
  workContent: string;
  warnings: string[];
}

export interface ParsedResult {
  entries: OvertimeEntry[];
  documentNumber: string;
  applicantName: string;
  applicationDate: string;
  warnings: string[];
}

export async function parsePdfTable(filePath: string, originalName: string): Promise<ParsedResult> {
  const text = await extractText(filePath);
  const documentNumber = extractDocumentNumber(originalName);
  return parseOvertimeDocument(text, documentNumber);
}

function extractDocumentNumber(filename: string): string {
  const match = filename.match(/(\d{4}-\d+)/);
  return match ? match[1] : "";
}

async function extractText(filePath: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("pdftotext", [
      "-layout",
      filePath,
      "-",
    ]);
    return stdout;
  } catch {
    throw new Error("pdftotext 실행 실패. poppler가 설치되어 있는지 확인하세요.");
  }
}

function parseOvertimeDocument(text: string, documentNumber: string): ParsedResult {
  const lines = text.split("\n").map((l) => l.trim());

  const applicantName = extractField(lines, /성명\s+(\S+)/);
  if (!applicantName) {
    throw new Error("신청자 성명을 찾을 수 없습니다.");
  }

  const applicationDate = extractApplicationDate(lines);
  const { entries, skippedLines } = extractOvertimeRows(lines, applicantName, applicationDate, documentNumber);

  const warnings: string[] = [];
  if (!documentNumber) warnings.push("문서번호를 파일명에서 찾을 수 없습니다.");
  if (!applicationDate) warnings.push("신청일을 찾을 수 없습니다.");
  if (skippedLines.length > 0) {
    warnings.push(
      `파싱 실패 ${skippedLines.length}건: ${skippedLines.map((l) => `"${l.trim().substring(0, 50)}..."`).join(", ")}`
    );
  }

  return { entries, documentNumber, applicantName, applicationDate, warnings };
}

function extractField(lines: string[], pattern: RegExp): string | null {
  for (const line of lines) {
    const match = line.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function extractApplicationDate(lines: string[]): string {
  for (const line of lines) {
    const match = line.match(
      /(\d{4}\.\s*\d{1,2}\.\s*\d{1,2})\s*\([월화수목금토일]\)/
    );
    if (match) return match[1].replace(/\s+/g, " ");
  }
  return "";
}

function extractOvertimeRows(
  lines: string[],
  name: string,
  applicationDate: string,
  documentNumber: string
): { entries: OvertimeEntry[]; skippedLines: string[] } {
  const entries: OvertimeEntry[] = [];
  const skippedLines: string[] = [];

  const rowCandidate = /^\s*(\d+)\s+\d{4}\./;
  const fullMatch =
    /^\s*(\d+)\s+([\d.]+\.?\s*\([^)]*\)~[\d.]+\.?\s*\([^)]*\))\s+(.*?)\s+([\d.:]+h?\d*)\s*$/;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(fullMatch);
    if (!match) {
      if (rowCandidate.test(lines[i]) && !lines[i].includes(".00.00")) {
        skippedLines.push(lines[i]);
      }
      continue;
    }

    const [, , periodRaw, workContent, hoursStr] = match;

    if (periodRaw.includes(".00.00")) continue;

    let fullPeriod = periodRaw.replace(/\s+/g, "");
    const nextLine = i + 1 < lines.length ? lines[i + 1] : "";
    const contMatch = nextLine.match(
      /^\s*([\d.]+\.?\s*\([^)]*\)~[\d.]+\.?\s*\([^)]*\))\s*$/
    );
    if (contMatch) {
      fullPeriod = fullPeriod + "\n" + contMatch[1].replace(/\s+/g, "");
      i++;
    }

    const warnings: string[] = [];
    const workHours = parseWorkHours(hoursStr);

    if (workHours <= 0) {
      warnings.push(`근무시간 파싱 실패: "${hoursStr}"`);
    }
    if (!workContent.trim()) {
      warnings.push("근무내용 없음");
    }
    if (!applicationDate) {
      warnings.push("신청일을 찾을 수 없음");
    }

    const recognizedHours = workHours * 1.5;
    const recognizedDays = recognizedHours / 8;

    entries.push({
      documentNumber,
      name,
      workPeriod: fullPeriod,
      workHours: round3(workHours),
      recognizedHours: round3(recognizedHours),
      recognizedDays: round3(recognizedDays),
      applicationDate,
      workContent: workContent.trim(),
      warnings,
    });
  }

  return { entries, skippedLines };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function parseWorkHours(raw: string): number {
  const s = raw.trim();

  const hm = s.match(/^(\d+)h(\d+)$/);
  if (hm) {
    return (parseInt(hm[1], 10) || 0) + (parseInt(hm[2], 10) || 0) / 60;
  }

  if (s.endsWith("h")) {
    return parseFloat(s.slice(0, -1)) || 0;
  }

  if (s.includes(":")) {
    const [h, m] = s.split(":");
    return (parseInt(h, 10) || 0) + (parseInt(m, 10) || 0) / 60;
  }

  return parseFloat(s) || 0;
}
