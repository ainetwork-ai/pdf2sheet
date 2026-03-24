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

function getAuth() {
  const keyFilePath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;

  if (keyFilePath) {
    const resolved = path.isAbsolute(keyFilePath)
      ? keyFilePath
      : path.join(process.cwd(), keyFilePath);

    if (!fs.existsSync(resolved)) {
      throw new Error(`Service Account 키 파일을 찾을 수 없습니다: ${resolved}`);
    }

    return new google.auth.GoogleAuth({
      keyFile: resolved,
      scopes: SCOPES,
    });
  }

  // Fallback: env variables
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!clientEmail || !privateKey) {
    throw new Error(
      "Google 인증 미설정. GOOGLE_SERVICE_ACCOUNT_KEY_FILE 또는 GOOGLE_CLIENT_EMAIL/GOOGLE_PRIVATE_KEY를 .env.local에 설정하세요."
    );
  }

  return new google.auth.GoogleAuth({
    credentials: {
      client_email: clientEmail,
      private_key: privateKey,
    },
    scopes: SCOPES,
  });
}

export async function appendToSheet(
  spreadsheetId: string,
  sheetName: string,
  values: string[][],
  includeHeaders: boolean = false,
  headers?: string[]
) {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const data = includeHeaders && headers ? [headers, ...values] : values;
  const range = `${sheetName}!A1`;

  const response = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: data },
  });

  return {
    updatedRows: response.data.updates?.updatedRows || 0,
    updatedRange: response.data.updates?.updatedRange || "",
  };
}

export async function getLastRowNumber(
  spreadsheetId: string,
  sheetName: string
): Promise<number> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A:A`,
  });

  const values = response.data.values;
  if (!values || values.length <= 1) return 0;

  // Find last numeric value in column A (skip header row)
  for (let i = values.length - 1; i >= 1; i--) {
    const val = parseInt(values[i][0], 10);
    if (!isNaN(val)) return val;
  }
  return 0;
}

export async function getSheetInfo(spreadsheetId: string) {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const response = await sheets.spreadsheets.get({
    spreadsheetId,
  });

  return {
    title: response.data.properties?.title || "",
    sheets:
      response.data.sheets?.map((s) => ({
        title: s.properties?.title || "",
        sheetId: s.properties?.sheetId || 0,
      })) || [],
  };
}
