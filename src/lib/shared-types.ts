export interface OvertimeEntry {
  documentNumber: string;
  name: string;
  workPeriod: string;
  workHours: number;
  recognizedHours: number;
  recognizedDays: number;
  applicationDate: string;
  workContent: string;
  warnings: string[];
}

export interface ParsedResult {
  id: number;
  originalName: string;
  applicantName: string;
  applicationDate: string;
  entries: OvertimeEntry[];
  entryCount: number;
  error?: string;
  warnings?: string[];
}

export interface HistorySession {
  id: string;
  savedAt: string;
  results: ParsedResult[];
}

export interface HistorySessionSummary {
  id: string;
  savedAt: string;
  fileCount: number;
  hasError: boolean;
}
