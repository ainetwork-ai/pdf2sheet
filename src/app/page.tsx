"use client";

import { useState, useCallback, useRef } from "react";

interface UploadedFile {
  id: number;
  originalName: string;
  size: number;
  status: string;
}

interface OvertimeEntry {
  name: string;
  workPeriod: string;
  workHours: number;
  recognizedHours: number;
  recognizedDays: number;
  applicationDate: string;
  approvalDate: string;
  workContent: string;
  warnings: string[];
}

interface ParsedResult {
  id: number;
  originalName: string;
  applicantName: string;
  applicationDate: string;
  entries: OvertimeEntry[];
  entryCount: number;
  error?: string;
}

const SHEET_COLUMNS = [
  "이름",
  "초과근무일시",
  "초과시간",
  "인정시간",
  "인정일수",
  "보상",
  "지급여부",
  "지급일",
  "신청일",
  "승인일",
  "근무내용",
];

export default function Home() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [parsedResults, setParsedResults] = useState<ParsedResult[]>([]);
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [sheetName, setSheetName] = useState("26년");

  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const showMessage = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleUpload = useCallback(async (fileList: FileList | File[]) => {
    const pdfFiles = Array.from(fileList).filter(
      (f) => f.type === "application/pdf"
    );
    if (pdfFiles.length === 0) {
      showMessage("error", "PDF 파일만 업로드할 수 있습니다.");
      return;
    }

    setUploading(true);
    const formData = new FormData();
    pdfFiles.forEach((f) => formData.append("files", f));

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setFiles((prev) => [...prev, ...data.files]);
      setParsedResults([]);
      showMessage("success", `${data.files.length}개 파일 업로드 완료`);
    } catch (err) {
      showMessage(
        "error",
        `업로드 실패: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setUploading(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      handleUpload(e.dataTransfer.files);
    },
    [handleUpload]
  );

  const handleParse = async () => {
    const uploadedIds = files
      .filter((f) => f.status === "uploaded")
      .map((f) => f.id);
    if (uploadedIds.length === 0) return;

    setParsing(true);
    try {
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileIds: uploadedIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setParsedResults(data.results);
      setFiles((prev) =>
        prev.map((f) =>
          uploadedIds.includes(f.id) ? { ...f, status: "parsed" } : f
        )
      );
      showMessage("success", `${data.results.length}개 파일 파싱 완료`);
    } catch (err) {
      showMessage(
        "error",
        `파싱 실패: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setParsing(false);
    }
  };

  const handleExport = async () => {
    if (!spreadsheetId.trim()) {
      showMessage("error", "스프레드시트 ID를 입력하세요.");
      return;
    }

    const parsedIds = files
      .filter((f) => f.status === "parsed")
      .map((f) => f.id);
    if (parsedIds.length === 0) return;

    setExporting(true);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileIds: parsedIds,
          spreadsheetId: spreadsheetId.trim(),
          sheetName: sheetName.trim() || "26년",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showMessage(
        "success",
        `${data.rowCount}건이 ${data.startRow}행부터 Google Sheets에 추가되었습니다.`
      );
      setFiles([]);
      setParsedResults([]);
    } catch (err) {
      showMessage(
        "error",
        `내보내기 실패: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async (fileId: number) => {
    try {
      await fetch("/api/files", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileIds: [fileId] }),
      });
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
      setParsedResults((prev) => prev.filter((r) => r.id !== fileId));
    } catch {
      showMessage("error", "파일 삭제 실패");
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const totalEntries = parsedResults.reduce(
    (sum, r) => sum + (r.entryCount || 0),
    0
  );
  const hasUploaded = files.some((f) => f.status === "uploaded");
  const hasParsed = parsedResults.some((r) => r.entryCount > 0);

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">PDF2Sheet</h1>
          <p className="text-slate-500 mt-1">
            초과근무 신청서 PDF를 Google Sheets로 내보내기
          </p>
        </div>

        {/* Message */}
        {message && (
          <div
            className={`mb-6 p-4 rounded-lg text-sm font-medium ${
              message.type === "success"
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Step 1: Upload */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-slate-800 mb-3">
            1. PDF 업로드
          </h2>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${
              dragOver
                ? "border-blue-500 bg-blue-50"
                : "border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && handleUpload(e.target.files)}
            />
            <div className="text-slate-400 mb-2">
              <svg
                className="w-12 h-12 mx-auto"
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
            </div>
            {uploading ? (
              <p className="text-slate-500">업로드 중...</p>
            ) : (
              <>
                <p className="text-slate-600 font-medium">
                  클릭하거나 초과근무 신청서 PDF를 드래그하세요
                </p>
                <p className="text-slate-400 text-sm mt-1">
                  여러 파일을 한번에 업로드할 수 있습니다
                </p>
              </>
            )}
          </div>
        </section>

        {/* File List */}
        {files.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-slate-800">
                업로드된 파일 ({files.length})
              </h2>
              {hasUploaded && (
                <button
                  onClick={handleParse}
                  disabled={parsing}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {parsing ? "파싱 중..." : "2. 데이터 추출"}
                </button>
              )}
            </div>
            <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex-shrink-0 w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                      <span className="text-red-600 text-xs font-bold">
                        PDF
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">
                        {file.originalName}
                      </p>
                      <p className="text-xs text-slate-400">
                        {formatSize(file.size)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs px-2 py-1 rounded-full font-medium ${
                        file.status === "uploaded"
                          ? "bg-yellow-100 text-yellow-700"
                          : file.status === "parsed"
                            ? "bg-emerald-100 text-emerald-700"
                            : file.status === "exported"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-red-100 text-red-700"
                      }`}
                    >
                      {file.status === "uploaded"
                        ? "대기 중"
                        : file.status === "parsed"
                          ? "추출 완료"
                          : file.status === "exported"
                            ? "내보내기 완료"
                            : "오류"}
                    </span>
                    <button
                      onClick={() => handleDelete(file.id)}
                      className="text-slate-400 hover:text-red-500 transition-colors"
                    >
                      <svg
                        className="w-4 h-4"
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
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Data Preview */}
        {parsedResults.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-slate-800 mb-3">
              추출된 데이터 미리보기 (총 {totalEntries}건)
            </h2>
            {parsedResults.map((result) =>
              result.error ? (
                <div
                  key={result.id}
                  className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600"
                >
                  {result.originalName}: {result.error}
                </div>
              ) : (
                <div
                  key={result.id}
                  className="mb-4 bg-white rounded-xl border border-slate-200 overflow-hidden"
                >
                  <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-3">
                    <span className="text-sm font-medium text-slate-700">
                      {result.originalName}
                    </span>
                    <span className="text-xs text-slate-400">
                      신청자: {result.applicantName} / 신청일:{" "}
                      {result.applicationDate} / {result.entryCount}건
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          {SHEET_COLUMNS.map((col) => (
                            <th
                              key={col}
                              className="px-3 py-2 text-left text-xs font-semibold text-slate-600 whitespace-nowrap border-b border-slate-200"
                            >
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {result.entries?.map((entry, i) => {
                          const hasWarning = entry.warnings?.length > 0;
                          return (
                            <tr
                              key={i}
                              className={
                                hasWarning
                                  ? "bg-red-50 hover:bg-red-100"
                                  : "hover:bg-slate-50"
                              }
                            >
                              <td className="px-3 py-2 text-slate-700 whitespace-nowrap">
                                {entry.name}
                              </td>
                              <td className="px-3 py-2 text-slate-600 whitespace-pre-line">
                                {entry.workPeriod}
                              </td>
                              <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                                {entry.workHours}
                              </td>
                              <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                                {entry.recognizedHours}
                              </td>
                              <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                                {entry.recognizedDays}
                              </td>
                              <td className="px-3 py-2 text-slate-300">-</td>
                              <td className="px-3 py-2 text-slate-300">-</td>
                              <td className="px-3 py-2 text-slate-300">-</td>
                              <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                                {entry.applicationDate}
                              </td>
                              <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                                {entry.approvalDate || "-"}
                              </td>
                              <td className="px-3 py-2 text-slate-600">
                                {entry.workContent}
                                {hasWarning && (
                                  <div className="mt-1 text-xs text-red-600 font-medium">
                                    {entry.warnings.join(", ")}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            )}
          </section>
        )}

        {/* Export to Google Sheets */}
        {hasParsed && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-slate-800 mb-3">
              3. Google Sheets로 내보내기
            </h2>
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    스프레드시트 ID 또는 링크
                  </label>
                  <input
                    type="text"
                    value={spreadsheetId}
                    onChange={(e) => setSpreadsheetId(e.target.value)}
                    placeholder="스프레드시트 링크를 붙여넣으세요"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    전체 URL 또는 ID만 입력 가능
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    시트 이름
                  </label>
                  <input
                    type="text"
                    value={sheetName}
                    onChange={(e) => setSheetName(e.target.value)}
                    placeholder="26년"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div className="mb-4 p-3 bg-slate-50 rounded-lg text-xs text-slate-500">
                5행부터 C열(이름)이 비어있는 첫 번째 행에 데이터가 입력됩니다.
              </div>
              <button
                onClick={handleExport}
                disabled={exporting || !spreadsheetId.trim()}
                className="w-full px-4 py-3 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {exporting
                  ? "내보내는 중..."
                  : `Google Sheets로 ${totalEntries}건 내보내기`}
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
