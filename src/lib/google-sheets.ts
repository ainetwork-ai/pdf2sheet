import { google } from "googleapis";
import fs from "fs";
import path from "path";
import { PresetConfig } from "./db";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

export function extractSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  return trimmed.split(/[/?#]/)[0];
}

const KEY_FILE = path.join(process.cwd(), "service-account-key.json");

function getAuth() {
  if (!fs.existsSync(KEY_FILE)) {
    throw new Error(
      "service-account-key.json 파일을 프로젝트 루트에 넣어주세요."
    );
  }

  return new google.auth.GoogleAuth({
    keyFile: KEY_FILE,
    scopes: SCOPES,
  });
}

/**
 * Find the first empty row using preset config.
 */
export async function findFirstEmptyRow(
  spreadsheetId: string,
  sheetName: string,
  preset: PresetConfig
): Promise<number> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const col = preset.emptyCheckColumn;
  const startRow = preset.startRow;

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!${col}${startRow}:${col}`,
  });

  const values = response.data.values;
  if (!values || values.length === 0) return startRow;

  for (let i = 0; i < values.length; i++) {
    const cell = values[i][0];
    if (!cell || cell.toString().trim() === "") {
      return startRow + i;
    }
  }

  return startRow + values.length;
}

// Field name → entry property mapping
const FIELD_KEY_MAP: Record<string, string> = {
  이름: "name",
  초과근무일시: "workPeriod",
  초과시간: "workHours",
  인정시간: "recognizedHours",
  인정일수: "recognizedDays",
  신청일: "applicationDate",
  근무내용: "workContent",
};

/**
 * Write data to sheet using dynamic column mapping from preset.
 * Groups adjacent columns into ranges for efficiency.
 */
export async function writeToSheet(
  spreadsheetId: string,
  sheetName: string,
  startRow: number,
  entries: Record<string, string>[],
  preset: PresetConfig
) {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  // Sort columns by letter
  const sortedFields = Object.entries(preset.columns)
    .map(([field, col]) => ({ field, col: col.toUpperCase() }))
    .sort((a, b) => a.col.localeCompare(b.col));

  // Group adjacent columns into ranges
  const groups: { startCol: string; fields: string[] }[] = [];
  for (const { field, col } of sortedFields) {
    const last = groups[groups.length - 1];
    if (last && nextCol(last.startCol, last.fields.length) === col) {
      last.fields.push(field);
    } else {
      groups.push({ startCol: col, fields: [field] });
    }
  }

  const endRow = startRow + entries.length - 1;

  const data = groups.map((g) => {
    const endCol = nextCol(g.startCol, g.fields.length - 1);
    return {
      range: `${sheetName}!${g.startCol}${startRow}:${endCol}${endRow}`,
      values: entries.map((entry) =>
        g.fields.map((f) => entry[FIELD_KEY_MAP[f] || f] || "")
      ),
    };
  });

  const response = await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data,
    },
  });

  return {
    updatedRows: response.data.totalUpdatedRows || 0,
    updatedRange: `${sheetName}!${sortedFields[0].col}${startRow}:${sortedFields[sortedFields.length - 1].col}${endRow}`,
  };
}

/** Get the column letter offset by n (e.g. "C", 2 → "E") */
function nextCol(start: string, n: number): string {
  const code = start.charCodeAt(0) + n;
  return String.fromCharCode(code);
}
