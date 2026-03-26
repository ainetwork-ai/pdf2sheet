import { google } from "googleapis";
import fs from "fs";
import path from "path";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

/**
 * Extract spreadsheet ID from a full URL or raw ID.
 * Handles: full URL, /d/ID/edit..., or just the ID itself.
 */
export function extractSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  // Already a plain ID (no slashes)
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

const MIN_DATA_ROW = 5;

/**
 * Find the first empty row by checking column B (이름) from row 5 onwards.
 * Rows where only 인정시간/인정일수 have "0" are treated as empty.
 */
export async function findFirstEmptyRow(
  spreadsheetId: string,
  sheetName: string
): Promise<number> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!C${MIN_DATA_ROW}:C`,
  });

  const values = response.data.values;
  if (!values || values.length === 0) return MIN_DATA_ROW;

  for (let i = 0; i < values.length; i++) {
    const cell = values[i][0];
    if (!cell || cell.toString().trim() === "") {
      return MIN_DATA_ROW + i;
    }
  }

  // All rows have data, append after last
  return MIN_DATA_ROW + values.length;
}

/**
 * Write data to specific rows, skipping H(보상), I(지급여부), J(지급일), L(승인일).
 * Writes: C~G (core data), K (신청일), M (근무내용)
 */
export async function writeToSheet(
  spreadsheetId: string,
  sheetName: string,
  startRow: number,
  coreRows: string[][],
  dateRows: string[][],
  contentRows: string[][]
) {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const endRow = startRow + coreRows.length - 1;

  const response = await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: [
        {
          range: `${sheetName}!C${startRow}:G${endRow}`,
          values: coreRows,
        },
        {
          range: `${sheetName}!K${startRow}:L${endRow}`,
          values: dateRows,
        },
        {
          range: `${sheetName}!M${startRow}:M${endRow}`,
          values: contentRows,
        },
      ],
    },
  });

  return {
    updatedRows: response.data.totalUpdatedRows || 0,
    updatedRange: `${sheetName}!C${startRow}:M${endRow}`,
  };
}

