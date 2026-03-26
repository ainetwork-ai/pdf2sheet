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

    db.exec(`
      CREATE TABLE IF NOT EXISTS presets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        config TEXT NOT NULL,
        is_default INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert default preset if none exists
    const count = db
      .prepare("SELECT COUNT(*) as cnt FROM presets")
      .get() as { cnt: number };
    if (count.cnt === 0) {
      db.prepare(
        "INSERT INTO presets (name, config, is_default) VALUES (?, ?, 1)"
      ).run(
        "기본",
        JSON.stringify({
          columns: {
            이름: "C",
            초과근무일시: "D",
            초과시간: "E",
            인정시간: "F",
            인정일수: "G",
            신청일: "K",
            승인일: "L",
            근무내용: "M",
          },
          startRow: 5,
          emptyCheckColumn: "C",
        })
      );
    }
  }
  return db;
}

// ---- Preset CRUD ----

export interface Preset {
  id: number;
  name: string;
  config: string;
  is_default: number;
  created_at: string;
}

export interface PresetConfig {
  columns: Record<string, string>;
  startRow: number;
  emptyCheckColumn: string;
}

export function getAllPresets(): Preset[] {
  const db = getDb();
  return db.prepare("SELECT * FROM presets ORDER BY is_default DESC, name ASC").all() as Preset[];
}

export function getPresetById(id: number): Preset | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM presets WHERE id = ?").get(id) as Preset | undefined;
}

export function getDefaultPreset(): Preset | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM presets WHERE is_default = 1").get() as Preset | undefined;
}

export function createPreset(name: string, config: PresetConfig) {
  const db = getDb();
  return db.prepare("INSERT INTO presets (name, config) VALUES (?, ?)").run(name, JSON.stringify(config));
}

export function updatePreset(id: number, name: string, config: PresetConfig) {
  const db = getDb();
  db.prepare("UPDATE presets SET name = ?, config = ? WHERE id = ?").run(name, JSON.stringify(config), id);
}

export function deletePreset(id: number) {
  const db = getDb();
  db.prepare("DELETE FROM presets WHERE id = ?").run(id);
}

export function setDefaultPreset(id: number) {
  const db = getDb();
  db.prepare("UPDATE presets SET is_default = 0").run();
  db.prepare("UPDATE presets SET is_default = 1 WHERE id = ?").run(id);
}

// ---- File CRUD ----

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
