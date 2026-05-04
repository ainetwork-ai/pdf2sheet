import fs from "fs";
import path from "path";
import type { HistorySession, HistorySessionSummary, ParsedResult } from "./shared-types";

// ---- Types ----

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

export interface Preset {
  id: number;
  name: string;
  config: string;
  is_default: number;
  created_at: string;
}

export interface PresetConfig {
  extraction?: ExtractionConfig;
  columns: Record<string, string>;
  startRow: number;
  emptyCheckColumn: string;
}

export interface ExtractionConfig {
  fieldMappings: { label: string; sheetColumn: string }[];
  tableMappings: { header: string; sheetColumn: string }[];
}

// ---- In-memory file store ----

const files = new Map<number, PdfFile>();
let fileIdCounter = 0;

export function insertFile(
  filename: string,
  originalName: string,
  filePath: string,
  fileSize: number
) {
  const id = ++fileIdCounter;
  const now = new Date().toISOString();
  files.set(id, {
    id,
    filename,
    original_name: originalName,
    file_path: filePath,
    file_size: fileSize,
    status: "uploaded",
    parsed_data: null,
    created_at: now,
    updated_at: now,
  });
  return { lastInsertRowid: id };
}

export function getFileById(id: number): PdfFile | undefined {
  return files.get(id);
}

export function getAllFiles(): PdfFile[] {
  return Array.from(files.values()).sort(
    (a, b) => b.created_at.localeCompare(a.created_at)
  );
}

export function updateFileStatus(
  id: number,
  status: string,
  parsedData?: string
) {
  const file = files.get(id);
  if (!file) return;
  file.status = status as PdfFile["status"];
  file.updated_at = new Date().toISOString();
  if (parsedData !== undefined) file.parsed_data = parsedData;
}

export function deleteFile(id: number) {
  files.delete(id);
}

// ---- Preset store (JSON file for persistence) ----

const PRESETS_PATH = path.join(process.cwd(), "presets.json");

const DEFAULT_PRESET: Omit<Preset, "id"> = {
  name: "초과근무 신청서",
  config: JSON.stringify({
    extraction: {
      fieldMappings: [
        { label: "성명", sheetColumn: "B" },
        { label: "신청일", sheetColumn: "J" },
      ],
      tableMappings: [
        { header: "근무기간", sheetColumn: "C" },
        { header: "근무내용", sheetColumn: "L" },
        { header: "근무시간", sheetColumn: "D" },
      ],
    },
    columns: {
      문서번호: "A",
      이름: "B",
      초과근무일시: "C",
      초과시간: "D",
      인정시간: "E",
      인정일수: "F",
      신청일: "J",
      근무내용: "L",
    },
    startRow: 5,
    emptyCheckColumn: "B",
  }),
  is_default: 1,
  created_at: new Date().toISOString(),
};

function loadPresets(): Preset[] {
  let presets: Preset[];
  try {
    if (fs.existsSync(PRESETS_PATH)) {
      presets = JSON.parse(fs.readFileSync(PRESETS_PATH, "utf-8"));
    } else {
      presets = [{ ...DEFAULT_PRESET, id: 1 }];
      savePresets(presets);
      return presets;
    }
  } catch {
    presets = [{ ...DEFAULT_PRESET, id: 1 }];
    savePresets(presets);
    return presets;
  }

  // Auto-migrate: update default preset if schema changed
  const defaultIdx = presets.findIndex((p) => p.is_default === 1);
  if (defaultIdx >= 0) {
    const current = JSON.parse(presets[defaultIdx].config) as PresetConfig;
    const expected = JSON.parse(DEFAULT_PRESET.config) as PresetConfig;
    const currentKeys = Object.keys(current.columns).sort().join(",");
    const expectedKeys = Object.keys(expected.columns).sort().join(",");
    const hasNewExtraction =
      !!current.extraction &&
      Array.isArray((current.extraction as ExtractionConfig).fieldMappings);
    if (currentKeys !== expectedKeys || !hasNewExtraction) {
      presets[defaultIdx].config = DEFAULT_PRESET.config;
      savePresets(presets);
    }
  }

  return presets;
}

function savePresets(presets: Preset[]) {
  fs.writeFileSync(PRESETS_PATH, JSON.stringify(presets, null, 2), "utf-8");
}

function nextPresetId(presets: Preset[]): number {
  return presets.length === 0 ? 1 : Math.max(...presets.map((p) => p.id)) + 1;
}

export function getAllPresets(): Preset[] {
  return loadPresets().sort(
    (a, b) => b.is_default - a.is_default || a.name.localeCompare(b.name)
  );
}

export function getPresetById(id: number): Preset | undefined {
  return loadPresets().find((p) => p.id === id);
}

export function getDefaultPreset(): Preset | undefined {
  return loadPresets().find((p) => p.is_default === 1);
}

export function createPreset(name: string, config: PresetConfig) {
  const presets = loadPresets();
  presets.push({
    id: nextPresetId(presets),
    name,
    config: JSON.stringify(config),
    is_default: 0,
    created_at: new Date().toISOString(),
  });
  savePresets(presets);
}

export function updatePreset(id: number, name: string, config: PresetConfig) {
  const presets = loadPresets();
  const p = presets.find((p) => p.id === id);
  if (p) {
    p.name = name;
    p.config = JSON.stringify(config);
    savePresets(presets);
  }
}

export function deletePreset(id: number) {
  const presets = loadPresets().filter((p) => p.id !== id);
  savePresets(presets);
}

export function setDefaultPreset(id: number) {
  const presets = loadPresets();
  for (const p of presets) {
    p.is_default = p.id === id ? 1 : 0;
  }
  savePresets(presets);
}

// ---- History store (JSON file for persistence) ----

const HISTORY_PATH = path.join(process.cwd(), "history.json");

function loadHistory(): HistorySession[] {
  try {
    if (fs.existsSync(HISTORY_PATH)) {
      return JSON.parse(fs.readFileSync(HISTORY_PATH, "utf-8"));
    }
  } catch {}
  return [];
}

function saveHistory(sessions: HistorySession[]) {
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(sessions, null, 2), "utf-8");
}

export function appendHistorySession(results: ParsedResult[]): HistorySession {
  const sessions = loadHistory();
  const session: HistorySession = {
    id: String(Date.now()),
    savedAt: new Date().toISOString(),
    results,
  };
  sessions.push(session);
  saveHistory(sessions);
  return session;
}

export function getAllHistorySessions(): HistorySessionSummary[] {
  return loadHistory()
    .map(({ id, savedAt, results }) => ({
      id,
      savedAt,
      fileCount: results.length,
      hasError: results.some((r) => !!r.error),
    }))
    .reverse();
}

export function getHistorySession(id: string): HistorySession | undefined {
  return loadHistory().find((s) => s.id === id);
}
