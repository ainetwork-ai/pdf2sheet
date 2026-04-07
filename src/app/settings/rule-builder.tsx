"use client";

import { useState, useCallback, useRef } from "react";
import type { TsvParseResult } from "@/lib/tsv-parser";

// ── Types (matching lib/rule-parser.ts) ─────────────────────────────────

interface FieldRule {
  name: string;
  keyword: string;
  direction: "right" | "below";
  pattern?: string;
}

interface TableColumnRule {
  name: string;
  keyword: string;
  type: "text" | "number" | "date" | "hours";
}

interface TableRule {
  headerKeywords: string[];
  columns: TableColumnRule[];
  rowPattern?: string;
}

interface ExtractionConfig {
  fields: FieldRule[];
  table: TableRule;
}

export interface RuleBuilderProps {
  extraction: ExtractionConfig;
  onChange: (extraction: ExtractionConfig) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────

const COLUMN_TYPES: { value: TableColumnRule["type"]; label: string }[] = [
  { value: "text", label: "텍스트" },
  { value: "number", label: "숫자" },
  { value: "date", label: "날짜" },
  { value: "hours", label: "시간" },
];

// ── Component ────────────────────────────────────────────────────────────

export default function RuleBuilder({ extraction, onChange }: RuleBuilderProps) {
  const [pdfName, setPdfName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<TsvParseResult | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  // Test result
  const [testResult, setTestResult] = useState<{
    fields: { name: string; value: string }[];
    entries: Record<string, unknown>[];
    warnings: string[];
  } | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [testing, setTesting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── PDF upload ────────────────────────────────────────────────────────

  const handleFileUpload = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("PDF 파일만 업로드할 수 있습니다.");
      return;
    }

    setLoading(true);
    setError("");
    setPreview(null);
    setTestResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/parse/preview", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "미리보기 실패");

      const result = data as TsvParseResult;
      setPreview(result);
      setPdfFile(file);
      setPdfName(file.name);

      // Auto-populate extraction config from detected table + fields
      const newExtraction = buildExtractionFromPreview(result, extraction);
      onChange(newExtraction);
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF 로드 실패");
    } finally {
      setLoading(false);
    }
  }, [extraction, onChange]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }, [handleFileUpload]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
  }, [handleFileUpload]);

  // ── Auto-populate from TSV parse result ───────────────────────────────

  function buildExtractionFromPreview(
    result: TsvParseResult,
    current: ExtractionConfig
  ): ExtractionConfig {
    // Build field rules from detected label-value pairs
    const fields: FieldRule[] = result.fields.map((f) => ({
      name: f.label,
      keyword: f.label,
      direction: "right" as const,
    }));

    // Build table columns from detected headers
    const columns: TableColumnRule[] = result.table
      ? result.table.headers.map((header) => {
          // Try to guess type from keyword
          const isHours = /시간|hour/i.test(header);
          const isDate = /기간|일자|날짜|date/i.test(header);
          const type: TableColumnRule["type"] = isHours
            ? "hours"
            : isDate
            ? "date"
            : "text";
          return { name: header, keyword: header, type };
        })
      : current.table.columns;

    const headerKeywords = result.table ? result.table.headers : current.table.headerKeywords;

    return {
      fields: fields.length > 0 ? fields : current.fields,
      table: {
        headerKeywords,
        columns,
        rowPattern: current.table.rowPattern,
      },
    };
  }

  // ── Field management ──────────────────────────────────────────────────

  const updateFieldName = useCallback((idx: number, name: string) => {
    const newFields = [...extraction.fields];
    newFields[idx] = { ...newFields[idx], name };
    onChange({ ...extraction, fields: newFields });
  }, [extraction, onChange]);

  const updateFieldPattern = useCallback((idx: number, pattern: string) => {
    const newFields = [...extraction.fields];
    newFields[idx] = { ...newFields[idx], pattern: pattern || undefined };
    onChange({ ...extraction, fields: newFields });
  }, [extraction, onChange]);

  const removeField = useCallback((idx: number) => {
    onChange({ ...extraction, fields: extraction.fields.filter((_, i) => i !== idx) });
  }, [extraction, onChange]);

  // ── Table column management ───────────────────────────────────────────

  const updateColumnType = useCallback(
    (idx: number, type: TableColumnRule["type"]) => {
      const newColumns = [...extraction.table.columns];
      newColumns[idx] = { ...newColumns[idx], type };
      onChange({ ...extraction, table: { ...extraction.table, columns: newColumns } });
    },
    [extraction, onChange]
  );

  const updateColumnName = useCallback(
    (idx: number, name: string) => {
      const newColumns = [...extraction.table.columns];
      newColumns[idx] = { ...newColumns[idx], name };
      onChange({ ...extraction, table: { ...extraction.table, columns: newColumns } });
    },
    [extraction, onChange]
  );

  const removeTableColumn = useCallback(
    (idx: number) => {
      const newColumns = extraction.table.columns.filter((_, i) => i !== idx);
      onChange({ ...extraction, table: { ...extraction.table, columns: newColumns } });
    },
    [extraction, onChange]
  );

  // ── Test ──────────────────────────────────────────────────────────────

  const handleTest = useCallback(async () => {
    if (!pdfFile) return;
    setTesting(true);
    setTestResult(null);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", pdfFile);
      formData.append("extraction", JSON.stringify(extraction));
      const res = await fetch("/api/parse/test", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "테스트 실패");
      setTestResult(data);
      setTestOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "테스트 실패");
    } finally {
      setTesting(false);
    }
  }, [pdfFile, extraction]);

  // ── Render helpers ────────────────────────────────────────────────────

  const renderUploadZone = () => (
    <div
      className="flex flex-col items-center justify-center h-full min-h-[200px] border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 cursor-pointer"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onClick={() => fileInputRef.current?.click()}
    >
      <svg className="w-10 h-10 text-slate-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
      </svg>
      <p className="text-sm font-medium text-slate-600 mb-1">샘플 PDF를 올려주세요</p>
      <p className="text-xs text-slate-400">드래그하거나 클릭하여 업로드</p>
    </div>
  );

  const renderTablePreview = () => {
    if (!preview?.table) return null;
    const { headers, rows } = preview.table;

    return (
      <div className="overflow-auto max-h-[55vh]">
        <table className="w-full text-xs border-collapse min-w-max">
          <thead>
            <tr className="bg-blue-50">
              {headers.map((h) => (
                <th key={h} className="px-3 py-2 text-left font-semibold text-blue-700 border border-slate-200 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 5).map((row, i) => (
              <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                {headers.map((h) => (
                  <td key={h} className="px-3 py-1.5 text-slate-700 border border-slate-200 whitespace-nowrap max-w-[200px] truncate">
                    {row[h] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length > 5 && (
              <tr>
                <td colSpan={headers.length} className="px-3 py-1.5 text-xs text-slate-400 text-center border border-slate-200">
                  + {rows.length - 5}개 행 더 있음
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  const renderFieldsPreview = () => {
    if (!preview?.fields || preview.fields.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-2">
        {preview.fields.map((f, i) => (
          <div key={i} className="flex items-center gap-1.5 px-2 py-1 bg-amber-50 border border-amber-200 rounded text-xs">
            <span className="font-medium text-amber-800">{f.label}</span>
            <span className="text-slate-400">:</span>
            <span className="text-slate-700">{f.value}</span>
          </div>
        ))}
      </div>
    );
  };

  // ── Main render ───────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        onChange={handleFileInput}
        className="hidden"
      />

      {error && (
        <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* PDF Upload / Preview area */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700">PDF 미리보기</h3>
          {pdfName && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 truncate max-w-[200px]">{pdfName}</span>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                다시 업로드
              </button>
            </div>
          )}
        </div>

        <div
          className="relative"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-xl z-10">
              <div className="text-sm text-slate-500">PDF 분석중...</div>
            </div>
          )}

          {!preview && !loading && renderUploadZone()}

          {preview && (
            <div className="space-y-3">
              {/* Detected fields */}
              {preview.fields.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-1.5">감지된 필드</p>
                  {renderFieldsPreview()}
                </div>
              )}

              {/* Detected table */}
              {preview.table ? (
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-1.5">
                    감지된 테이블 ({preview.table.rows.length}행)
                  </p>
                  {renderTablePreview()}
                </div>
              ) : (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded p-2">
                  테이블을 감지하지 못했습니다. 다른 PDF를 시도해보세요.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Column mapping section (shown when table detected) */}
      {extraction.table.columns.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">컬럼 매핑</h3>
          <p className="text-xs text-slate-400 mb-3">각 컬럼의 데이터 유형을 설정하세요.</p>
          <div className="space-y-2">
            {extraction.table.columns.map((col, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs p-2 bg-slate-50 rounded-lg">
                <span className="flex-1 font-medium text-slate-700 truncate" title={col.keyword}>
                  {col.keyword}
                </span>
                <input
                  type="text"
                  value={col.name}
                  onChange={(e) => updateColumnName(idx, e.target.value)}
                  className="w-32 px-2 py-1 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs"
                  placeholder="추출 필드명"
                />
                <select
                  value={col.type}
                  onChange={(e) => updateColumnType(idx, e.target.value as TableColumnRule["type"])}
                  className="px-2 py-1 border border-slate-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs"
                >
                  {COLUMN_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <button
                  onClick={() => removeTableColumn(idx)}
                  className="p-1 text-slate-400 hover:text-red-500 shrink-0"
                  title="컬럼 제거"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Field rules section */}
      {extraction.fields.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">단일 필드</h3>
          <div className="space-y-2">
            {extraction.fields.map((field, idx) => (
              <div key={idx} className="flex items-start gap-2 p-2 bg-slate-50 rounded-lg text-xs">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 font-mono bg-amber-100 px-1.5 py-0.5 rounded whitespace-nowrap">
                      {field.keyword}
                    </span>
                    <span className="text-slate-400">→</span>
                    <input
                      type="text"
                      value={field.name}
                      onChange={(e) => updateFieldName(idx, e.target.value)}
                      className="flex-1 px-2 py-1 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="추출 필드명"
                    />
                  </div>
                  <input
                    type="text"
                    value={field.pattern || ""}
                    onChange={(e) => updateFieldPattern(idx, e.target.value)}
                    className="w-full px-2 py-1 border border-slate-200 rounded font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="패턴 (정규식, 선택사항)"
                  />
                </div>
                <button
                  onClick={() => removeField(idx)}
                  className="p-1 text-slate-400 hover:text-red-500 shrink-0"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Test button */}
      <button
        onClick={handleTest}
        disabled={!pdfFile || testing}
        className="w-full py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {testing ? "테스트 중..." : "테스트 실행"}
      </button>

      {/* Test result */}
      {testResult && (
        <div className="bg-white border border-slate-200 rounded-xl">
          <button
            onClick={() => setTestOpen(!testOpen)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 rounded-xl"
          >
            <span>
              {testOpen ? "▾" : "▸"} 테스트 결과
              {testResult.warnings.length > 0 && (
                <span className="ml-2 text-xs text-amber-600 font-normal">
                  ({testResult.warnings.length}개 경고)
                </span>
              )}
            </span>
            <span className="text-xs text-slate-500 font-normal">
              필드 {testResult.fields.length}개, 행 {testResult.entries.length}개
            </span>
          </button>

          {testOpen && (
            <div className="px-4 pb-4 space-y-3">
              {testResult.warnings.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-xs font-medium text-amber-700 mb-1">경고</p>
                  <ul className="text-xs text-amber-600 space-y-0.5">
                    {testResult.warnings.map((w, i) => (
                      <li key={i}>- {w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {testResult.fields.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-600 mb-1">단일 필드</p>
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    {testResult.fields.map((f, i) => (
                      <div key={i} className="flex gap-2 px-2 py-1 bg-slate-50 rounded">
                        <span className="text-slate-500">{f.name}</span>
                        <span className="text-slate-800 font-medium">{f.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {testResult.entries.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-600 mb-1">테이블 데이터</p>
                  <div className="overflow-auto max-h-[300px]">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50">
                          {Object.keys(testResult.entries[0]).map((key) => (
                            <th key={key} className="px-2 py-1 text-left font-medium text-slate-600 border border-slate-200">
                              {key}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {testResult.entries.map((entry, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            {Object.values(entry).map((val, j) => (
                              <td key={j} className="px-2 py-1 text-slate-700 border border-slate-200">
                                {String(val ?? "")}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
