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
  workContent: string;
}

export interface ParsedResult {
  entries: OvertimeEntry[];
  applicantName: string;
  applicationDate: string;
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

  // 1. Extract applicant name
  const applicantName = extractField(lines, /성명\s+(\S+)/);
  if (!applicantName) {
    throw new Error("신청자 성명을 찾을 수 없습니다.");
  }

  // 2. Extract application date from header line "2026-206 2026. 3. 23 (월) 오후 10:57 작성"
  const applicationDate = extractApplicationDate(lines);

  // 3. Extract overtime table rows
  const entries = extractOvertimeRows(lines, applicantName, applicationDate);

  return { entries, applicantName, applicationDate };
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
    // Match pattern like "2026. 3. 23 (월)" or "2026. 3. 23(월)"
    const match = line.match(
      /(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\s*\([월화수목금토일]\)/
    );
    if (match) {
      const [, year, month, day] = match;
      return `${year}.${month.padStart(2, "0")}.${day.padStart(2, "0")}`;
    }
  }
  return "";
}

function extractOvertimeRows(
  lines: string[],
  name: string,
  applicationDate: string
): OvertimeEntry[] {
  const entries: OvertimeEntry[] = [];

  // Find table data lines: starts with a number (1, 2, 3...) followed by date pattern
  // Hours format: "5.5" (decimal), "1h" (with suffix), "4:10" (hours:minutes)
  for (const line of lines) {
    const match = line.match(
      /^\s*(\d+)\s+([\d.]+\.\s*\([^)]*\)~[\d.]+\([^)]*\))\s+(.*?)\s+([\d.:]+h?)\s*$/
    );
    if (!match) continue;

    const [, , periodRaw, workContent, hoursStr] = match;

    // Skip template/empty rows (dates like "2026.00.00")
    if (periodRaw.includes(".00.00")) continue;

    const workHours = parseWorkHours(hoursStr);
    if (workHours <= 0) continue;

    const recognizedHours = workHours * 1.5;
    const recognizedDays = recognizedHours / 8;

    entries.push({
      name,
      workPeriod: periodRaw.replace(/\s+/g, ""),
      workHours,
      recognizedHours: Math.round(recognizedHours * 10000) / 10000,
      recognizedDays: Math.round(recognizedDays * 10000) / 10000,
      applicationDate,
      workContent: workContent.trim(),
    });
  }

  return entries;
}

/**
 * Parse work hours from various formats:
 * "5.5" → 5.5, "1h" → 1, "4:10" → 4.1667
 */
function parseWorkHours(raw: string): number {
  const s = raw.trim();

  // "1h" or "2.5h"
  if (s.endsWith("h")) {
    return parseFloat(s.slice(0, -1)) || 0;
  }

  // "4:10" (hours:minutes)
  if (s.includes(":")) {
    const [h, m] = s.split(":");
    return (parseInt(h, 10) || 0) + (parseInt(m, 10) || 0) / 60;
  }

  // "5.5" (decimal)
  return parseFloat(s) || 0;
}

/**
 * Convert OvertimeEntry to sheet data split by ranges.
 * C~G: 이름, 초과근무일시, 초과시간, 인정시간, 인정일수
 * H(보상), I(지급여부), J(지급일), L(승인일) → 건드리지 않음
 * K: 신청일, M: 근무내용
 */
export function toSheetData(entry: OvertimeEntry) {
  return {
    coreData: [                                   // C:G
      entry.name,                                 // C: 이름
      entry.workPeriod,                           // D: 초과근무일시
      String(entry.workHours),                    // E: 초과시간
      String(entry.recognizedHours),              // F: 인정시간
      String(entry.recognizedDays),               // G: 인정일수
    ],
    applicationDate: [entry.applicationDate],     // K: 신청일
    workContent: [entry.workContent],             // M: 근무내용
  };
}
