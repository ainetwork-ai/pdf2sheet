"use client";

import { useState, useCallback, useRef } from "react";

// ── Types (inline, matching lib/rule-parser.ts) ─────────────────────────

interface GridToken {
  text: string;
  row: number;
  col: number;
  id: string;
}

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

// ── Token state helpers ─────────────────────────────────────────────────

type TokenState = "default" | "keyword" | "candidate" | "assigned";

function tokenClass(state: TokenState): string {
  switch (state) {
    case "keyword":
      return "bg-amber-200 rounded px-0.5 cursor-pointer";
    case "candidate":
      return "border border-dashed border-emerald-400 bg-emerald-50 rounded px-0.5 cursor-pointer";
    case "assigned":
      return "bg-amber-100 rounded px-0.5";
    default:
      return "hover:bg-blue-100 rounded px-0.5 cursor-pointer";
  }
}

// ── Neighbor helpers (mirrors lib/text-grid.ts findNeighbors) ───────────

function findNeighbors(
  grid: GridToken[],
  tokenId: string
): { right: GridToken[]; below: GridToken[] } {
  const token = grid.find((t) => t.id === tokenId);
  if (!token) return { right: [], below: [] };

  const right = grid
    .filter((t) => t.row === token.row && t.col > token.col)
    .sort((a, b) => a.col - b.col);

  const below: GridToken[] = [];
  for (let r = token.row + 1; r <= token.row + 3; r++) {
    const rowTokens = grid
      .filter((t) => t.row === r)
      .sort((a, b) => a.col - b.col);
    if (rowTokens.length > 0) {
      const closest =
        rowTokens.find((t) => t.col >= token.col - 2) || rowTokens[0];
      below.push(closest);
    }
  }
  return { right: right.slice(0, 5), below: below.slice(0, 3) };
}

// ── Test result types ───────────────────────────────────────────────────

interface TestResult {
  fields: { name: string; value: string }[];
  entries: Record<string, unknown>[];
  warnings: string[];
}

// ── Component ───────────────────────────────────────────────────────────

export default function RuleBuilder({ extraction, onChange }: RuleBuilderProps) {
  // PDF preview state
  const [grid, setGrid] = useState<GridToken[]>([]);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfName, setPdfName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Token interaction state
  const [selectedKeywordId, setSelectedKeywordId] = useState<string | null>(
    null
  );
  const [candidateIds, setCandidateIds] = useState<Set<string>>(new Set());
  const [showTooltip, setShowTooltip] = useState(false);

  // Test result state
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [testing, setTesting] = useState(false);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── PDF upload ──────────────────────────────────────────────────────

  const handleFileUpload = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        setError("PDF 파일만 업로드할 수 있습니다.");
        return;
      }

      setLoading(true);
      setError("");
      setGrid([]);
      setSelectedKeywordId(null);
      setCandidateIds(new Set());
      setTestResult(null);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/parse/preview", { method: "POST", body: formData });
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || "미리보기 실패");

        setGrid(data.grid);
        setPdfFile(file);
        setPdfName(file.name);
      } catch (err) {
        setError(err instanceof Error ? err.message : "PDF 로드 실패");
      } finally {
        setLoading(false);
      }
    },
    []
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

  const handleReupload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // ── Token click logic ─────────────────────────────────────────────

  const assignedKeywords = new Set(extraction.fields.map((f) => f.keyword));

  const getTokenState = useCallback(
    (token: GridToken): TokenState => {
      if (selectedKeywordId === token.id) return "keyword";
      if (candidateIds.has(token.id)) return "candidate";
      if (assignedKeywords.has(token.text)) return "assigned";
      return "default";
    },
    [selectedKeywordId, candidateIds, assignedKeywords]
  );

  const handleTokenClick = useCallback(
    (token: GridToken) => {
      // If clicking a candidate, create a field rule
      if (selectedKeywordId && candidateIds.has(token.id)) {
        const keywordToken = grid.find((t) => t.id === selectedKeywordId);
        if (!keywordToken) return;

        const neighbors = findNeighbors(grid, selectedKeywordId);
        const direction = neighbors.right.some((t) => t.id === token.id)
          ? "right" as const
          : "below" as const;

        const newField: FieldRule = {
          name: keywordToken.text,
          keyword: keywordToken.text,
          direction,
        };

        onChange({
          ...extraction,
          fields: [...extraction.fields, newField],
        });

        setSelectedKeywordId(null);
        setCandidateIds(new Set());
        setShowTooltip(false);
        return;
      }

      // If clicking a token as keyword (first click)
      const neighbors = findNeighbors(grid, token.id);
      const allCandidates = new Set([
        ...neighbors.right.map((t) => t.id),
        ...neighbors.below.map((t) => t.id),
      ]);

      setSelectedKeywordId(token.id);
      setCandidateIds(allCandidates);
      setShowTooltip(true);
    },
    [selectedKeywordId, candidateIds, grid, extraction, onChange]
  );

  // ── Field management ──────────────────────────────────────────────

  const removeField = useCallback(
    (index: number) => {
      const newFields = extraction.fields.filter((_, i) => i !== index);
      onChange({ ...extraction, fields: newFields });
    },
    [extraction, onChange]
  );

  const updateFieldName = useCallback(
    (index: number, name: string) => {
      const newFields = [...extraction.fields];
      newFields[index] = { ...newFields[index], name };
      onChange({ ...extraction, fields: newFields });
    },
    [extraction, onChange]
  );

  const updateFieldPattern = useCallback(
    (index: number, pattern: string) => {
      const newFields = [...extraction.fields];
      newFields[index] = {
        ...newFields[index],
        pattern: pattern || undefined,
      };
      onChange({ ...extraction, fields: newFields });
    },
    [extraction, onChange]
  );

  // ── Table management ──────────────────────────────────────────────

  const updateHeaderKeywords = useCallback(
    (value: string) => {
      const keywords = value
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);
      onChange({
        ...extraction,
        table: { ...extraction.table, headerKeywords: keywords },
      });
    },
    [extraction, onChange]
  );

  const addTableColumn = useCallback(() => {
    const newCol: TableColumnRule = {
      name: "",
      keyword: "",
      type: "text",
    };
    onChange({
      ...extraction,
      table: {
        ...extraction.table,
        columns: [...extraction.table.columns, newCol],
      },
    });
  }, [extraction, onChange]);

  const updateTableColumn = useCallback(
    (index: number, updates: Partial<TableColumnRule>) => {
      const newColumns = [...extraction.table.columns];
      newColumns[index] = { ...newColumns[index], ...updates };
      onChange({
        ...extraction,
        table: { ...extraction.table, columns: newColumns },
      });
    },
    [extraction, onChange]
  );

  const removeTableColumn = useCallback(
    (index: number) => {
      const newColumns = extraction.table.columns.filter(
        (_, i) => i !== index
      );
      onChange({
        ...extraction,
        table: { ...extraction.table, columns: newColumns },
      });
    },
    [extraction, onChange]
  );

  const updateRowPattern = useCallback(
    (pattern: string) => {
      onChange({
        ...extraction,
        table: {
          ...extraction.table,
          rowPattern: pattern || undefined,
        },
      });
    },
    [extraction, onChange]
  );

  // ── Test ──────────────────────────────────────────────────────────

  const handleTest = useCallback(async () => {
    if (!pdfFile) return;

    setTesting(true);
    setTestResult(null);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", pdfFile);
      formData.append("extraction", JSON.stringify(extraction));

      const res = await fetch("/api/parse/test", {
        method: "POST",
        body: formData,
      });
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

  // ── Token grid rendering ──────────────────────────────────────────

  const renderTokenGrid = () => {
    if (grid.length === 0) return null;

    // Group tokens by row
    const rowMap = new Map<number, GridToken[]>();
    for (const token of grid) {
      if (!rowMap.has(token.row)) {
        rowMap.set(token.row, []);
      }
      rowMap.get(token.row)!.push(token);
    }

    const sortedRows = [...rowMap.keys()].sort((a, b) => a - b);

    return (
      <div className="font-mono text-xs leading-relaxed whitespace-pre-wrap overflow-auto max-h-[70vh]">
        {sortedRows.map((rowNum) => {
          const tokens = rowMap.get(rowNum)!.sort((a, b) => a.col - b.col);
          return (
            <div key={rowNum} className="min-h-[1.25rem]">
              {tokens.map((token) => {
                const state = getTokenState(token);
                return (
                  <span
                    key={token.id}
                    className={`${tokenClass(state)} inline-block mr-1`}
                    onClick={() => handleTokenClick(token)}
                    title={`row:${token.row} col:${token.col}`}
                  >
                    {token.text}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  };

  // ── Empty state ───────────────────────────────────────────────────

  const renderEmptyState = () => (
    <div
      className="flex flex-col items-center justify-center h-full min-h-[300px] border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 cursor-pointer"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onClick={() => fileInputRef.current?.click()}
    >
      <svg
        className="w-12 h-12 text-slate-400 mb-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
        />
      </svg>
      <p className="text-sm font-medium text-slate-600 mb-2">
        샘플 PDF를 올려주세요
      </p>
      <div className="text-xs text-slate-400 space-y-1 text-center">
        <p>1. PDF를 드래그하거나 클릭하여 업로드</p>
        <p>2. 텍스트에서 키워드를 클릭</p>
        <p>3. 값 위치를 클릭하여 룰 생성</p>
      </div>
    </div>
  );

  // ── Main render ───────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        onChange={handleFileInput}
        className="hidden"
      />

      {/* Error display */}
      {error && (
        <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Main layout: preview (60%) + rule panel (40%) */}
      <div className="flex gap-4 min-h-[400px]">
        {/* Left: PDF text preview */}
        <div className="w-[60%] flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-slate-700">
              PDF 텍스트 미리보기
            </h3>
            {pdfName && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 truncate max-w-[200px]">
                  {pdfName}
                </span>
                <button
                  onClick={handleReupload}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  다시 업로드
                </button>
              </div>
            )}
          </div>

          <div
            className="flex-1 bg-white border border-slate-200 rounded-xl p-4 relative"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-xl z-10">
                <div className="text-sm text-slate-500">PDF 로딩중...</div>
              </div>
            )}

            {/* Tooltip */}
            {showTooltip && selectedKeywordId && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 bg-slate-800 text-white text-xs rounded-lg shadow-lg">
                이 키워드의 오른쪽이나 아래에서 값을 클릭하세요
                <button
                  className="ml-2 text-slate-400 hover:text-white"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedKeywordId(null);
                    setCandidateIds(new Set());
                    setShowTooltip(false);
                  }}
                >
                  취소
                </button>
              </div>
            )}

            {grid.length > 0 ? renderTokenGrid() : renderEmptyState()}
          </div>
        </div>

        {/* Right: extraction rule panel */}
        <div className="w-[40%] flex flex-col gap-4 overflow-auto max-h-[80vh]">
          {/* Single fields section */}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">
              단일 필드
            </h3>

            {extraction.fields.length === 0 ? (
              <p className="text-xs text-slate-400">
                왼쪽 미리보기에서 키워드를 클릭하여 필드를 추가하세요.
              </p>
            ) : (
              <div className="space-y-2">
                {extraction.fields.map((field, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 p-2 bg-slate-50 rounded-lg text-xs"
                  >
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={field.name}
                          onChange={(e) =>
                            updateFieldName(idx, e.target.value)
                          }
                          className="flex-1 px-2 py-1 border border-slate-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                          placeholder="필드명"
                        />
                        <span className="text-slate-400 whitespace-nowrap">
                          {field.direction === "right" ? "→" : "↓"}{" "}
                          <span className="font-mono bg-amber-100 px-1 rounded">
                            {field.keyword}
                          </span>
                        </span>
                      </div>
                      <input
                        type="text"
                        value={field.pattern || ""}
                        onChange={(e) =>
                          updateFieldPattern(idx, e.target.value)
                        }
                        className="w-full px-2 py-1 border border-slate-200 rounded text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="패턴 (정규식, 선택사항)"
                      />
                    </div>
                    <button
                      onClick={() => removeField(idx)}
                      className="p-1 text-slate-400 hover:text-red-500 shrink-0"
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Table section */}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">
              테이블
            </h3>

            {/* Header keywords */}
            <div className="mb-3">
              <label className="block text-xs font-medium text-slate-600 mb-1">
                헤더 키워드 (쉼표 구분)
              </label>
              <input
                type="text"
                value={extraction.table.headerKeywords.join(", ")}
                onChange={(e) => updateHeaderKeywords(e.target.value)}
                className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="날짜, 시간, 내용"
              />
            </div>

            {/* Column list */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-slate-600">
                  컬럼 설정
                </label>
                <button
                  onClick={addTableColumn}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  + 컬럼 추가
                </button>
              </div>

              {extraction.table.columns.length === 0 ? (
                <p className="text-xs text-slate-400">컬럼이 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {extraction.table.columns.map((col, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-1.5 text-xs"
                    >
                      <input
                        type="text"
                        value={col.name}
                        onChange={(e) =>
                          updateTableColumn(idx, { name: e.target.value })
                        }
                        className="flex-1 px-2 py-1 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="컬럼명"
                      />
                      <input
                        type="text"
                        value={col.keyword}
                        onChange={(e) =>
                          updateTableColumn(idx, { keyword: e.target.value })
                        }
                        className="flex-1 px-2 py-1 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="키워드"
                      />
                      <select
                        value={col.type}
                        onChange={(e) =>
                          updateTableColumn(idx, {
                            type: e.target.value as TableColumnRule["type"],
                          })
                        }
                        className="px-2 py-1 border border-slate-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="text">텍스트</option>
                        <option value="number">숫자</option>
                        <option value="date">날짜</option>
                        <option value="hours">시간</option>
                      </select>
                      <button
                        onClick={() => removeTableColumn(idx)}
                        className="p-1 text-slate-400 hover:text-red-500 shrink-0"
                      >
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Row pattern */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                행 필터 패턴 (정규식, 선택사항)
              </label>
              <input
                type="text"
                value={extraction.table.rowPattern || ""}
                onChange={(e) => updateRowPattern(e.target.value)}
                className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="예: \\d{4}[.-]\\d{2}[.-]\\d{2}"
              />
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
        </div>
      </div>

      {/* Test result (collapsible) */}
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
              필드 {testResult.fields.length}개, 행{" "}
              {testResult.entries.length}개
            </span>
          </button>

          {testOpen && (
            <div className="px-4 pb-4 space-y-3">
              {/* Warnings */}
              {testResult.warnings.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-xs font-medium text-amber-700 mb-1">
                    경고
                  </p>
                  <ul className="text-xs text-amber-600 space-y-0.5">
                    {testResult.warnings.map((w, i) => (
                      <li key={i}>- {w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Fields */}
              {testResult.fields.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-600 mb-1">
                    단일 필드
                  </p>
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    {testResult.fields.map((f, i) => (
                      <div
                        key={i}
                        className="flex gap-2 px-2 py-1 bg-slate-50 rounded"
                      >
                        <span className="text-slate-500">{f.name}</span>
                        <span className="text-slate-800 font-medium">
                          {f.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Table entries */}
              {testResult.entries.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-600 mb-1">
                    테이블 데이터
                  </p>
                  <div className="overflow-auto max-h-[300px]">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50">
                          {Object.keys(testResult.entries[0]).map((key) => (
                            <th
                              key={key}
                              className="px-2 py-1 text-left font-medium text-slate-600 border border-slate-200"
                            >
                              {key}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {testResult.entries.map((entry, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            {Object.values(entry).map((val, j) => (
                              <td
                                key={j}
                                className="px-2 py-1 text-slate-700 border border-slate-200"
                              >
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
