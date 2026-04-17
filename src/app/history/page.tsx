import Link from "next/link";
import { getAllHistorySessions } from "@/lib/db";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HistoryPage() {
  const sessions = getAllHistorySessions();

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/"
            className="text-slate-500 hover:text-slate-700 text-sm"
          >
            ← 메인으로
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">히스토리</h1>
        </div>

        {sessions.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            저장된 히스토리가 없습니다.
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => (
              <Link
                key={session.id}
                href={`/history/${session.id}`}
                className="block bg-white rounded-xl border border-slate-200 px-5 py-4 hover:border-blue-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-slate-700">
                      {formatDate(session.savedAt)}
                    </span>
                    <span className="text-sm text-slate-400">
                      {session.fileCount}개 파일
                    </span>
                    {session.hasError && (
                      <span className="text-xs text-red-500 font-medium">
                        오류 포함
                      </span>
                    )}
                  </div>
                  <svg
                    className="w-4 h-4 text-slate-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
