"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { SubmissionPage, SubmissionRow } from "@vibejudge/shared";
import { api } from "@/lib/api";
import { VerdictBadge } from "@/app/verdict-badge";
import { secondaryButtonClass } from "./ui";

// কোনো সাবমিশন judge হতে থাকলে এত পরপর প্রথম পাতা রিফ্রেশ হয়
const POLL_MS = 2000;

/**
 * সাবমিশনের তালিকা। `query` যেমন "mine=true&problem=aplusb"।
 * `refreshKey` বদলালে (যেমন নতুন সাবমিট হলে) আবার লোড হয়।
 */
export function SubmissionTable({
  query,
  showProblem = true,
  showUser = true,
  refreshKey = 0,
  emptyText = "No submissions yet.",
}: {
  query: string;
  showProblem?: boolean;
  showUser?: boolean;
  refreshKey?: number;
  emptyText?: string;
}) {
  const [rows, setRows] = useState<SubmissionRow[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadFirst = useCallback(async () => {
    const page = await api<SubmissionPage>(`/submissions?${query}`);
    setRows((old) => {
      // প্রথম পাতা নতুন করি; "Load more" দিয়ে আনা পুরোনো সারিগুলো নিচে থেকে যায়
      if (!old) return page.submissions;
      const fresh = new Set(page.submissions.map((s) => s.id));
      return [...page.submissions, ...old.filter((s) => !fresh.has(s.id))];
    });
    setNextCursor((c) => c ?? page.nextCursor);
    return page.submissions;
  }, [query]);

  useEffect(() => {
    setRows(null);
    setNextCursor(null);
    setError(null);
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const tick = async () => {
      try {
        const first = await loadFirst();
        if (cancelled) return;
        if (first.some((s) => s.verdict === "PENDING" || s.verdict === "JUDGING")) timer = setTimeout(tick, POLL_MS);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    };
    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [loadFirst, refreshKey]);

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const page = await api<SubmissionPage>(`/submissions?${query}&cursor=${encodeURIComponent(nextCursor)}`);
      setRows((old) => [...(old ?? []), ...page.submissions]);
      setNextCursor(page.nextCursor);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }

  if (error) return <p className="text-sm text-red-600">Could not load submissions: {error}</p>;
  if (!rows) return <p className="text-sm text-zinc-500">Loading…</p>;
  if (rows.length === 0) return <p className="text-sm text-zinc-500">{emptyText}</p>;

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
        <table className="w-full text-left text-sm">
          <thead className="bg-black/[.03] text-zinc-500 dark:bg-white/[.04]">
            <tr>
              <th className="px-3 py-2 font-medium">When</th>
              {showUser && <th className="px-3 py-2 font-medium">User</th>}
              {showProblem && <th className="px-3 py-2 font-medium">Problem</th>}
              <th className="px-3 py-2 font-medium">Lang</th>
              <th className="px-3 py-2 font-medium">Verdict</th>
              <th className="px-3 py-2 font-medium">Time</th>
              <th className="px-3 py-2 font-medium">Memory</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="border-t border-black/10 dark:border-white/10">
                <td className="whitespace-nowrap px-3 py-2">
                  <Link href={`/submissions/${s.id}`} className="text-sky-700 hover:underline dark:text-sky-400">
                    {formatWhen(s.createdAt)}
                  </Link>
                </td>
                {showUser && <td className="px-3 py-2">{s.user?.username ?? "—"}</td>}
                {showProblem && (
                  <td className="px-3 py-2">
                    <Link href={problemHref(s)} className="hover:underline">
                      {s.contest && <b className="mr-1">{s.contest.label}.</b>}
                      {s.problem.title}
                    </Link>
                    {s.contest && !s.contest.inContest && <span className="ml-1.5 text-xs text-zinc-500">(practice)</span>}
                  </td>
                )}
                <td className="px-3 py-2 uppercase">{s.language}</td>
                <td className="px-3 py-2">
                  <Link href={`/submissions/${s.id}`}>
                    <VerdictBadge verdict={s.verdict} />
                  </Link>
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  {s.timeMs !== null && s.verdict !== "CE" ? `${s.timeMs} ms` : "—"}
                  {s.score !== null && <span className="ml-2 font-medium">{s.score} pts</span>}
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  {s.memoryKb !== null && s.verdict !== "CE" ? formatMemory(s.memoryKb) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {nextCursor && (
        <button type="button" className={`${secondaryButtonClass} self-center`} onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}

/** কনটেস্টের সাবমিশন হলে কনটেস্টের প্রবলেম পেজে (CONTEST প্রবলেম archive-এ দেখা যায় না) */
export function problemHref(s: Pick<SubmissionRow, "problem" | "contest">): string {
  return s.contest ? `/contests/${s.contest.slug}/problems/${s.contest.label}` : `/problems/${s.problem.slug}`;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? d.toLocaleTimeString() : d.toLocaleString();
}

function formatMemory(kb: number): string {
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
}
