import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface OvertimeEntry {
  name: string;
  workPeriod: string;
  workHours: number;
  recognizedHours: number;
  recognizedDays: number;
  applicationDate: string;
  approvalDate: string;
  workContent: string;
  warnings: string[];
}

export interface ParsedResult {
  entries: OvertimeEntry[];
  applicantName: string;
  applicationDate: string;
  approvalDate: string;
  warnings: string[];
}

export async function parsePdfTable(filePath: string): Promise<ParsedResult> {
  const text = await extractText(filePath);
  return parseOvertimeDocument(text);
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

function parseOvertimeDocument(text: string): ParsedResult {
  const lines = text.split("\n").map((l) => l.trim());

  const applicantName = extractField(lines, /성명\s+(\S+)/);
  if (!applicantName) {
    throw new Error("신청자 성명을 찾을 수 없습니다.");
  }

  const applicationDate = extractApplicationDate(lines);
  const approvalDate = extractApprovalDate(lines);
  const { entries, skippedLines } = extractOvertimeRows(lines, applicantName, applicationDate, approvalDate);

  const warnings: string[] = [];
  if (!applicationDate) warnings.push("신청일을 찾을 수 없습니다.");
  if (!approvalDate) warnings.push("승인일을 찾을 수 없습니다.");
  if (skippedLines.length > 0) {
    warnings.push(
      `파싱 실패 ${skippedLines.length}건: ${skippedLines.map((l) => `"${l.trim().substring(0, 50)}..."`).join(", ")}`
    );
  }

  return { entries, applicantName, applicationDate, approvalDate, warnings };
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

function extractApprovalDate(lines: string[]): string {
  for (const line of lines) {
    const match = line.match(
      /승인했어요\.\s*(\d{4}\.\s*\d{1,2}\.\s*\d{1,2})\s*\([월화수목금토일]\)/
    );
    if (match) return match[1].replace(/\s+/g, " ");
  }
  return "";
}

function extractOvertimeRows(
  lines: string[],
  name: string,
  applicationDate: string,
  approvalDate: string
): { entries: OvertimeEntry[]; skippedLines: string[] } {
  const entries: OvertimeEntry[] = [];
  const skippedLines: string[] = [];

  // Regex to detect potential table rows (starts with a number)
  const rowCandidate = /^\s*(\d+)\s+\d{4}\./;
  const fullMatch =
    /^\s*(\d+)\s+([\d.]+\.?\s*\([^)]*\)~[\d.]+\.?\s*\([^)]*\))\s+(.*?)\s+([\d.:]+h?\d*)\s*$/;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(fullMatch);
    if (!match) {
      // Detect rows that look like table data but failed to parse
      if (rowCandidate.test(lines[i]) && !lines[i].includes(".00.00")) {
        skippedLines.push(lines[i]);
      }
      continue;
    }

    const [, , periodRaw, workContent, hoursStr] = match;

    if (periodRaw.includes(".00.00")) continue;

    // Check next line for continuation (multi-line period → 1 cell with newline)
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
    if (!approvalDate) {
      warnings.push("승인일을 찾을 수 없음");
    }

    const recognizedHours = workHours * 1.5;
    const recognizedDays = recognizedHours / 8;

    entries.push({
      name,
      workPeriod: fullPeriod,
      workHours: round3(workHours),
      recognizedHours: round3(recognizedHours),
      recognizedDays: round3(recognizedDays),
      applicationDate,
      approvalDate,
      workContent: workContent.trim(),
      warnings,
    });
  }

  return { entries, skippedLines };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Parse work hours from various formats:
 * "5.5" → 5.5, "1h" → 1, "4:10" → 4.17, "1h40" → 1.67
 */
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

