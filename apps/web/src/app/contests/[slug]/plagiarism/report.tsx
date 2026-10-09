"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { PlagiarismReport } from "@vibejudge/shared";
import { api } from "@/lib/api";
import { inputClass, secondaryButtonClass } from "@/components/ui";
import { ContestHeader } from "../contest-header";
import { useContest } from "../use-contest";

const THRESHOLDS = [30, 50, 70, 90];

export function similarityColor(p: number): string {
  if (p >= 90) return "bg-red-600 text-white";
  if (p >= 70) return "bg-red-500/20 text-red-700 dark:text-red-300";
  if (p >= 50) return "bg-amber-500/20 text-amber-800 dark:text-amber-300";
  return "bg-zinc-500/15";
}

export function PlagiarismReportView({ slug }: { slug: string }) {
  const { contest, phase, now, error: contestError } = useContest(slug);
  const [min, setMin] = useState(50);
  const [report, setReport] = useState<PlagiarismReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (fresh: boolean) => {
      setLoading(true);
      setError(null);
      try {
        setReport(await api<PlagiarismReport>(`/contests/${encodeURIComponent(slug)}/plagiarism?min=${min}${fresh ? "&fresh=true" : ""}`));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [slug, min],
  );

  useEffect(() => {
    if (contest?.viewer.canManage) void load(false);
  }, [contest?.viewer.canManage, load]);

  if (contestError) return <p className="text-red-600">Could not load contest: {contestError}</p>;
  if (!contest || !phase) return <p className="text-zinc-500">Loading…</p>;
  if (!contest.viewer.canManage) return <p>Only the contest author can see this page.</p>;

  return (
    <div className="flex flex-col gap-6">
      <ContestHeader contest={contest} phase={phase} now={now} active="plagiarism" />

      <p className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
        ⚠ This is a list of <b>suspicious pairs, not proof</b>. Variable names, comments and formatting are ignored, so
        renamed copies still match — but on short or easy problems many honest solutions look alike. Always read both
        codes before deciding. Each participant&apos;s last accepted (or last judged) submission is compared.
      </p>

      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-zinc-500">Show pairs with similarity ≥</span>
          <select className={`${inputClass} w-28`} value={min} onChange={(e) => setMin(Number(e.target.value))}>
            {THRESHOLDS.map((t) => (
              <option key={t} value={t}>
                {t}%
              </option>
            ))}
          </select>
        </label>
        <button type="button" className={secondaryButtonClass} disabled={loading} onClick={() => load(true)}>
          {loading ? "Checking…" : "↻ Re-check now"}
        </button>
        {report && <span className="pb-2 text-zinc-500">Checked {new Date(report.generatedAt).toLocaleTimeString()}</span>}
      </div>

      {error && <p className="text-red-600">{error}</p>}
      {!report && !error && <p className="text-zinc-500">Comparing submissions…</p>}
      {report?.problems.map((p) => (
        <section key={p.label} className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">
            {p.label}. {p.title}
            <span className="ml-2 text-sm font-normal text-zinc-500">
              {p.compared} participants compared · {p.pairs.length} suspicious {p.pairs.length === 1 ? "pair" : "pairs"}
            </span>
          </h2>
          {p.pairs.length === 0 ? (
            <p className="text-sm text-zinc-500">Nothing above {report.minSimilarity}%.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
              <table className="w-full text-left text-sm">
                <thead className="bg-black/[.03] text-zinc-500 dark:bg-white/[.04]">
                  <tr>
                    <th className="px-3 py-2 font-medium">Similarity</th>
                    <th className="px-3 py-2 font-medium">Participant A</th>
                    <th className="px-3 py-2 font-medium">Participant B</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {p.pairs.map((pair) => (
                    <tr key={`${pair.a.submissionId}-${pair.b.submissionId}`} className="border-t border-black/10 dark:border-white/10">
                      <td className="px-3 py-2">
                        <span className={`rounded px-2 py-0.5 font-semibold ${similarityColor(pair.similarity)}`}>{pair.similarity}%</span>
                      </td>
                      <td className="px-3 py-2">{pair.a.username}</td>
                      <td className="px-3 py-2">{pair.b.username}</td>
                      <td className="px-3 py-2 text-right">
                        <Link
                          href={`/contests/${slug}/plagiarism/compare?a=${pair.a.submissionId}&b=${pair.b.submissionId}`}
                          className="text-sky-700 hover:underline dark:text-sky-400"
                        >
                          Compare →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
