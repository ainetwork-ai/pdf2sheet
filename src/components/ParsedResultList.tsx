import type { ParsedResult } from "@/lib/shared-types";

const SHEET_COLUMNS = [
  "문서번호",
  "이름",
  "초과근무일시",
  "초과시간",
  "인정시간",
  "인정일수",
  "보상",
  "지급여부",
  "지급일",
  "신청일",
  "근무내용",
];

export default function ParsedResultList({
  results,
}: {
  results: ParsedResult[];
}) {
  const totalEntries = results.reduce((sum, r) => sum + (r.entryCount || 0), 0);

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-800 mb-3">
        추출된 데이터 미리보기 (총 {totalEntries}건)
      </h2>
      {results.map((result) =>
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
                신청자: {result.applicantName} / 신청일: {result.applicationDate}{" "}
                / {result.entryCount}건
              </span>
            </div>
            {result.warnings && result.warnings.length > 0 && (
              <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-xs text-red-600 font-medium">
                {result.warnings.map((w, wi) => (
                  <div key={wi}>{w}</div>
                ))}
              </div>
            )}
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
                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap font-mono text-xs">
                          {entry.documentNumber}
                        </td>
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
    </div>
  );
}
