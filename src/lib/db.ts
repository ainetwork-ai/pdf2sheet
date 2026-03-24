import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = path.join(process.cwd(), "data", "pdf2sheet.db");

let db: Database.Database | null = null;

export interface PdfFile {
  id: number;
  filename: string;
  original_name: string;
  file_path: string;
  file_size: number;
  status: "uploaded" | "parsed" | "exported" | "error";
  parsed_data: string | null;
  created_at: string;
  updated_at: string;
}

export function getDb(): Database.Database {
  if (!db) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.exec(`
      CREATE TABLE IF NOT EXISTS pdf_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        status TEXT DEFAULT 'uploaded',
        parsed_data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }
  return db;
}

export function insertFile(
  filename: string,
  originalName: string,
  filePath: string,
  fileSize: number
) {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO pdf_files (filename, original_name, file_path, file_size) VALUES (?, ?, ?, ?)`
  );
  return stmt.run(filename, originalName, filePath, fileSize);
}

export function getFileById(id: number): PdfFile | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM pdf_files WHERE id = ?").get(id) as
    | PdfFile
    | undefined;
}

export function getAllFiles(): PdfFile[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM pdf_files ORDER BY created_at DESC")
    .all() as PdfFile[];
}

export function updateFileStatus(
  id: number,
  status: string,
  parsedData?: string
) {
  const db = getDb();
  if (parsedData !== undefined) {
    db.prepare(
      "UPDATE pdf_files SET status = ?, parsed_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(status, parsedData, id);
  } else {
    db.prepare(
      "UPDATE pdf_files SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(status, id);
  }
}

export function deleteFile(id: number) {
  const db = getDb();
  db.prepare("DELETE FROM pdf_files WHERE id = ?").run(id);
}
