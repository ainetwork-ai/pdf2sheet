import Link from "next/link";
import { notFound } from "next/navigation";
import { getHistorySession } from "@/lib/db";
import ParsedResultList from "@/components/ParsedResultList";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function HistoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = getHistorySession(id);
  if (!session) notFound();

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-6">
          <Link
            href="/history"
            className="text-slate-500 hover:text-slate-700 text-sm"
          >
            ← 히스토리 목록
          </Link>
          <span className="text-slate-400 text-sm">
            {formatDate(session.savedAt)}
          </span>
        </div>
        <ParsedResultList results={session.results} />
      </div>
    </main>
  );
}
