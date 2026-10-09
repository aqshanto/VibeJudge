"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { SubmissionView as Submission } from "@vibejudge/shared";
import { api } from "@/lib/api";
import { VerdictBadge } from "../../verdict-badge";
import { problemHref } from "@/components/submission-table";

const POLL_MS = 1000;

export function SubmissionView({ id }: { id: string }) {
  const [sub, setSub] = useState<Submission | null>(null);
  const [error, setError] = useState<string | null>(null);

  // judge শেষ না হওয়া পর্যন্ত প্রতি সেকেন্ডে রিফ্রেশ
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const load = async () => {
      try {
        const s = await api<Submission>(`/submissions/${encodeURIComponent(id)}`);
        if (cancelled) return;
        setSub(s);
        if (s.verdict === "PENDING" || s.verdict === "JUDGING") timer = setTimeout(load, POLL_MS);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    };
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id]);

  if (error) return <p className="text-red-600">Could not load submission: {error}</p>;
  if (!sub) return <p className="text-zinc-500">Loading…</p>;

  const done = sub.verdict !== "PENDING" && sub.verdict !== "JUDGING";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-sm text-zinc-500">
          Submission <span className="font-mono">{sub.id}</span>
          {sub.user && <> by {sub.user.username}</>} ·{" "}
          <Link href={problemHref(sub)} className="text-sky-700 hover:underline dark:text-sky-400">
            {sub.contest && `${sub.contest.label}. `}
            {sub.problem.title}
          </Link>{" "}
          {sub.contest && (
            <>
              ·{" "}
              <Link href={`/contests/${sub.contest.slug}`} className="hover:underline">
                contest
              </Link>
              {!sub.contest.inContest && " (practice)"}{" "}
            </>
          )}
          · {sub.language.toUpperCase()}
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-2xl">
            <VerdictBadge verdict={sub.verdict} full />
          </span>
          {done && sub.verdict !== "CE" && (
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              {sub.timeMs} ms · {formatMemory(sub.memoryKb ?? 0)}
            </span>
          )}
          {done && sub.score !== null && <span className="text-lg font-semibold">{sub.score} / 100</span>}
        </div>
      </header>

      {sub.compileOutput && (
        <section>
          <h2 className="mb-2 font-semibold">Compiler output</h2>
          <pre className="max-h-80 overflow-auto rounded-lg bg-black/[.04] p-3 text-xs dark:bg-white/[.06]">
            {sub.compileOutput}
          </pre>
        </section>
      )}

      {sub.tests.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Tests</h2>
          <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
            <table className="w-full text-left text-sm">
              <thead className="bg-black/[.03] text-zinc-500 dark:bg-white/[.04]">
                <tr>
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Verdict</th>
                  <th className="px-3 py-2 font-medium">Time</th>
                  <th className="px-3 py-2 font-medium">Memory</th>
                  <th className="px-3 py-2 font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {sub.tests.map((t) => (
                  <tr key={t.name} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-3 py-2 font-mono">{t.name}</td>
                    <td className="px-3 py-2">
                      <VerdictBadge verdict={t.verdict} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{t.timeMs} ms</td>
                    <td className="whitespace-nowrap px-3 py-2">{formatMemory(t.memoryKb)}</td>
                    <td className="px-3 py-2 text-xs text-zinc-500">{t.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {sub.source !== null && (
        <section>
          <h2 className="mb-2 font-semibold">Source</h2>
          <pre className="max-h-[32rem] overflow-auto rounded-lg bg-black/[.04] p-3 text-xs dark:bg-white/[.06]">
            {sub.source}
          </pre>
        </section>
      )}
    </div>
  );
}

function formatMemory(kb: number): string {
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
}
