import PDFParser from "pdf2json";

interface TextItem {
  x: number;
  y: number;
  text: string;
}

export interface ParsedTable {
  headers: string[];
  rows: string[][];
  pageCount: number;
}

interface PdfText {
  x: number;
  y: number;
  R: Array<{ T: string }>;
}

interface PdfPage {
  Texts: PdfText[];
}

interface PdfData {
  Pages: PdfPage[];
}

export async function parsePdfTable(filePath: string): Promise<ParsedTable> {
  const pdfData = await loadPdf(filePath);
  return extractTables(pdfData);
}

function loadPdf(filePath: string): Promise<PdfData> {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser();

    pdfParser.on("pdfParser_dataReady", (data: PdfData) => {
      resolve(data);
    });

    pdfParser.on("pdfParser_dataError", (err: Error | { parserError: Error }) => {
      const message = err instanceof Error ? err.message : String(err.parserError);
      reject(new Error(message));
    });

    pdfParser.loadPDF(filePath);
  });
}

function extractTables(pdfData: PdfData): ParsedTable {
  const allItems: TextItem[] = [];

  for (const page of pdfData.Pages) {
    if (!page.Texts) continue;

    for (const text of page.Texts) {
      const content = text.R?.map((r) => decodeURIComponent(r.T)).join("") || "";
      if (content.trim()) {
        allItems.push({
          x: text.x,
          y: text.y,
          text: content.trim(),
        });
      }
    }
  }

  if (allItems.length === 0) {
    return { headers: [], rows: [], pageCount: pdfData.Pages.length };
  }

  // Sort by y (top to bottom), then x (left to right)
  allItems.sort((a, b) => a.y - b.y || a.x - b.x);

  // Group by approximate y position to form rows
  const ROW_TOLERANCE = 0.5;
  const rowGroups: TextItem[][] = [];
  let currentRow: TextItem[] = [allItems[0]];

  for (let i = 1; i < allItems.length; i++) {
    if (Math.abs(allItems[i].y - currentRow[0].y) <= ROW_TOLERANCE) {
      currentRow.push(allItems[i]);
    } else {
      rowGroups.push([...currentRow]);
      currentRow = [allItems[i]];
    }
  }
  rowGroups.push(currentRow);

  // Sort each row by x position
  for (const row of rowGroups) {
    row.sort((a, b) => a.x - b.x);
  }

  // First row = headers
  const headerRow = rowGroups[0];
  const headers = headerRow.map((item) => item.text);
  const headerXPositions = headerRow.map((item) => item.x);

  // Map data rows to columns using nearest header x-position
  const rows = rowGroups.slice(1).map((row) => {
    const rowData: string[] = new Array(headers.length).fill("");
    for (const item of row) {
      const colIdx = findNearestColumn(item.x, headerXPositions);
      rowData[colIdx] = rowData[colIdx]
        ? rowData[colIdx] + " " + item.text
        : item.text;
    }
    return rowData;
  });

  // Filter out empty rows
  const filteredRows = rows.filter((row) => row.some((cell) => cell !== ""));

  return {
    headers,
    rows: filteredRows,
    pageCount: pdfData.Pages.length,
  };
}

function findNearestColumn(x: number, headerXPositions: number[]): number {
  let minDist = Infinity;
  let colIdx = 0;
  for (let j = 0; j < headerXPositions.length; j++) {
    const dist = Math.abs(x - headerXPositions[j]);
    if (dist < minDist) {
      minDist = dist;
      colIdx = j;
    }
  }
  return colIdx;
}
