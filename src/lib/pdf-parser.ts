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
}

export interface ParsedResult {
  entries: OvertimeEntry[];
  applicantName: string;
  applicationDate: string;
  approvalDate: string;
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

  // 3. Extract approval date from "Common Computer님이 승인했어요. 2026. 3. 20 (금) 오후 12:32"
  const approvalDate = extractApprovalDate(lines);

  // 4. Extract overtime table rows
  const entries = extractOvertimeRows(lines, applicantName, applicationDate, approvalDate);

  return { entries, applicantName, applicationDate, approvalDate };
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

function extractApprovalDate(lines: string[]): string {
  for (const line of lines) {
    const match = line.match(
      /승인했어요\.\s*(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\s*\([월화수목금토일]\)/
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
  applicationDate: string,
  approvalDate: string
): OvertimeEntry[] {
  const entries: OvertimeEntry[] = [];

  // Find table data lines: starts with a number (1, 2, 3...) followed by date pattern
  // Hours format: "5.5", "1h", "4:10", "1h40"
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(
      /^\s*(\d+)\s+([\d.]+\.\s*\([^)]*\)~[\d.]+\([^)]*\))\s+(.*?)\s+([\d.:]+h?\d*)\s*$/
    );
    if (!match) continue;

    const [, , periodRaw, workContent, hoursStr] = match;

    // Skip template/empty rows (dates like "2026.00.00")
    if (periodRaw.includes(".00.00")) continue;

    // Check if next line is a continuation of work period (multi-line period)
    let fullPeriod = periodRaw;
    const nextLine = i + 1 < lines.length ? lines[i + 1] : "";
    const contMatch = nextLine.match(
      /^\s+([\d.]+\.\s*\([^)]*\)~[\d.]+\([^)]*\))\s*$/
    );
    if (contMatch) {
      fullPeriod = periodRaw + "\n" + contMatch[1];
      i++; // skip next line
    }

    const workHours = parseWorkHours(hoursStr);
    if (workHours <= 0) continue;

    const recognizedHours = workHours * 1.5;
    const recognizedDays = recognizedHours / 8;

    entries.push({
      name,
      workPeriod: fullPeriod.replace(/\s+/g, ""),
      workHours: round2(workHours),
      recognizedHours: round2(recognizedHours),
      recognizedDays: round2(recognizedDays),
      applicationDate,
      approvalDate,
      workContent: workContent.trim(),
    });
  }

  return entries;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Parse work hours from various formats:
 * "5.5" → 5.5, "1h" → 1, "4:10" → 4.17, "1h40" → 1.67
 */
function parseWorkHours(raw: string): number {
  const s = raw.trim();

  // "1h40" (hours h minutes)
  const hm = s.match(/^(\d+)h(\d+)$/);
  if (hm) {
    return (parseInt(hm[1], 10) || 0) + (parseInt(hm[2], 10) || 0) / 60;
  }

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
    dateData: [                                   // K:L
      entry.applicationDate,                      // K: 신청일
      entry.approvalDate,                         // L: 승인일
    ],
    workContent: [entry.workContent],             // M: 근무내용
  };
}
