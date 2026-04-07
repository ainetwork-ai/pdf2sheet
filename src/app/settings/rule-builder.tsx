"use client";

import { useState, useCallback, useRef } from "react";
import type { TsvParseResult } from "@/lib/tsv-parser";

// ── Types ────────────────────────────────────────────────────────────────

export interface ExtractionConfig {
  fieldMappings: { label: string; sheetColumn: string }[];
  tableMappings: { header: string; sheetColumn: string }[];
}

export interface RuleBuilderProps {
  extraction: ExtractionConfig;
  onChange: (extraction: ExtractionConfig) => void;
}

// ── Sheet column options: empty (skip) or A-Z ────────────────────────────

const SHEET_COLS = ["", ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i))];

function ColSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-2 py-1 border border-slate-300 rounded bg-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
    >
      {SHEET_COLS.map((c) => (
        <option key={c} value={c}>
          {c === "" ? "— 건너뜀" : c}
        </option>
      ))}
    </select>
  );
}

// ── Component ────────────────────────────────────────────────────────────

export default function RuleBuilder({ extraction, onChange }: RuleBuilderProps) {
  const [pdfName, setPdfName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<TsvParseResult | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  const [testResult, setTestResult] = useState<{
    fields: { name: string; value: string }[];
    entries: Record<string, unknown>[];
    warnings: string[];
  } | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [testing, setTesting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Upload ────────────────────────────────────────────────────────────

  const handleFileUpload = useCallback(
    async (file: File) => {
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

        // Auto-populate mappings from detection, preserve existing sheet columns if label matches
        const existingFieldMap = new Map(extraction.fieldMappings.map((m) => [m.label, m.sheetColumn]));
        const existingTableMap = new Map(extraction.tableMappings.map((m) => [m.header, m.sheetColumn]));

        const fieldMappings = result.fields.map((f) => ({
          label: f.label,
          sheetColumn: existingFieldMap.get(f.label) ?? "",
        }));

        const tableMappings = result.table
          ? result.table.headers.map((h) => ({
              header: h,
              sheetColumn: existingTableMap.get(h) ?? "",
            }))
          : extraction.tableMappings;

        onChange({ fieldMappings, tableMappings });
      } catch (err) {
        setError(err instanceof Error ? err.message : "PDF 로드 실패");
      } finally {
        setLoading(false);
      }
    },
    [extraction, onChange]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const file = e.dataTransfer.files[0];
      if (file) handleFileUpload(file);
    },
    [handleFileUpload]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFileUpload(file);
    },
    [handleFileUpload]
  );

  // ── Mapping updates ───────────────────────────────────────────────────

  const updateFieldCol = useCallback(
    (idx: number, sheetColumn: string) => {
      const updated = [...extraction.fieldMappings];
      updated[idx] = { ...updated[idx], sheetColumn };
      onChange({ ...extraction, fieldMappings: updated });
    },
    [extraction, onChange]
  );

  const updateTableCol = useCallback(
    (idx: number, sheetColumn: string) => {
      const updated = [...extraction.tableMappings];
      updated[idx] = { ...updated[idx], sheetColumn };
      onChange({ ...extraction, tableMappings: updated });
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

  // ── Render ────────────────────────────────────────────────────────────

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

      {/* Upload zone */}
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

        <div className="relative" onDrop={handleDrop} onDragOver={handleDragOver}>
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-xl z-10">
              <span className="text-sm text-slate-500">PDF 분석중...</span>
            </div>
          )}

          {!preview && !loading && (
            <div
              className="flex flex-col items-center justify-center min-h-[180px] border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <svg className="w-10 h-10 text-slate-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-sm font-medium text-slate-600 mb-1">샘플 PDF를 올려주세요</p>
              <p className="text-xs text-slate-400">드래그하거나 클릭하여 업로드</p>
            </div>
          )}

          {preview && (
            <div className="space-y-4">
              {/* Detected fields table */}
              {preview.fields.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-2">감지된 필드</p>
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="px-3 py-2 text-left font-medium text-slate-500 border border-slate-200">라벨</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-500 border border-slate-200">값</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-500 border border-slate-200">시트 열</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.fields.map((f, i) => {
                        const mapping = extraction.fieldMappings.find((m) => m.label === f.label);
                        const mappingIdx = extraction.fieldMappings.findIndex((m) => m.label === f.label);
                        return (
                          <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                            <td className="px-3 py-1.5 font-medium text-slate-700 border border-slate-200 whitespace-nowrap">
                              {f.label}
                            </td>
                            <td className="px-3 py-1.5 text-slate-600 border border-slate-200">
                              {f.value}
                            </td>
                            <td className="px-3 py-1.5 border border-slate-200">
                              {mappingIdx !== -1 ? (
                                <ColSelect
                                  value={mapping?.sheetColumn ?? ""}
                                  onChange={(v) => updateFieldCol(mappingIdx, v)}
                                />
                              ) : (
                                <span className="text-slate-400 text-xs">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Detected table */}
              {preview.table ? (
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-2">
                    감지된 테이블 ({preview.table.rows.length}행)
                  </p>
                  <div className="overflow-auto max-h-[50vh]">
                    <table className="text-xs border-collapse min-w-max">
                      <thead>
                        <tr className="bg-blue-50">
                          {preview.table.headers.map((h, i) => {
                            const mappingIdx = extraction.tableMappings.findIndex((m) => m.header === h);
                            const mapping = extraction.tableMappings[mappingIdx];
                            return (
                              <th key={h} className="border border-slate-200 px-2 pt-2 pb-1 text-left align-top">
                                <div className="font-semibold text-blue-700 whitespace-nowrap mb-1">{h}</div>
                                {mappingIdx !== -1 ? (
                                  <ColSelect
                                    value={mapping?.sheetColumn ?? ""}
                                    onChange={(v) => updateTableCol(mappingIdx, v)}
                                  />
                                ) : null}
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.table.rows.slice(0, 5).map((row, i) => (
                          <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                            {preview.table!.headers.map((h) => (
                              <td
                                key={h}
                                className="px-3 py-1.5 text-slate-700 border border-slate-200 whitespace-nowrap max-w-[200px] truncate"
                              >
                                {row[h] ?? ""}
                              </td>
                            ))}
                          </tr>
                        ))}
                        {preview.table.rows.length > 5 && (
                          <tr>
                            <td
                              colSpan={preview.table.headers.length}
                              className="px-3 py-1.5 text-slate-400 text-center border border-slate-200"
                            >
                              + {preview.table.rows.length - 5}개 행 더 있음
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
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
