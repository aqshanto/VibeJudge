"use client";

import { useEffect, useMemo, useState } from "react";
import type { ScoringType, StandingsCell, StandingsView } from "@vibejudge/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ContestHeader } from "../contest-header";
import { useContest } from "../use-contest";
import { inputClass, secondaryButtonClass } from "@/components/ui";

// চলাকালীন এত পরপর রিফ্রেশ (সার্ভারে ১০ সেকেন্ডের cache আছে)
const REFRESH_MS = 30_000;

export function Standings({ slug }: { slug: string }) {
  const { contest, phase, now, error: contestError } = useContest(slug);
  const { user } = useAuth();
  const [data, setData] = useState<StandingsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState("");
  const [batch, setBatch] = useState("");

  const distinct = (values: (string | null)[]) =>
    [...new Set(values.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const sections = useMemo(() => distinct(data?.rows.map((r) => r.section) ?? []), [data]);
  const batches = useMemo(() => distinct(data?.rows.map((r) => r.batch) ?? []), [data]);
  const filtering = section !== "" || batch !== "";

  // ফিল্টার করলে সেই দলের ভেতরের rank (সমান হলে একই) — পাশে মোট rank-ও থাকে
  const rows = useMemo(() => {
    const list = (data?.rows ?? []).filter((r) => (!section || r.section === section) && (!batch || r.batch === batch));
    let prev: (typeof list)[number] | undefined;
    let prevRank = 0;
    return list.map((r, i) => {
      const localRank = prev && prev.points === r.points && prev.penalty === r.penalty ? prevRank : i + 1;
      prev = r;
      prevRank = localRank;
      return { ...r, localRank };
    });
  }, [data, section, batch]);

  useEffect(() => {
    if (!phase) return;
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const load = async () => {
      try {
        const d = await api<StandingsView>(`/contests/${encodeURIComponent(slug)}/standings`, { cache: "no-cache" });
        if (cancelled) return;
        setData(d);
        setError(null);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
      // ১০০০ জন একসাথে যেন না চায় — প্রতিবার ০-৫ সেকেন্ড এলোমেলো দেরি
      if (!cancelled && phase === "RUNNING") timer = setTimeout(load, REFRESH_MS + Math.random() * 5000);
    };
    void load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [slug, phase]);

  if (contestError) return <p className="text-red-600">Could not load contest: {contestError}</p>;
  if (!contest || !phase) return <p className="text-zinc-500">Loading…</p>;

  return (
    <div className="flex flex-col gap-6">
      <ContestHeader contest={contest} phase={phase} now={now} active="standings" />

      {error && <p className="text-zinc-600 dark:text-zinc-400">{error}</p>}
      {!data && !error && <p className="text-zinc-500">Loading…</p>}
      {data && (
        <>
          {data.frozen && (
            <p className="rounded-md bg-sky-500/10 px-3 py-2 text-sm text-sky-800 dark:text-sky-300">
              ❄ The standings are frozen. Submissions made after the freeze show as <b>?</b> until the contest ends.
            </p>
          )}
          {(sections.length > 1 || batches.length > 1 || contest.viewer.canManage) && (
            <div className="flex flex-wrap items-end gap-3 text-sm">
              {sections.length > 1 && (
                <label className="flex flex-col gap-1">
                  <span className="text-zinc-500">Section</span>
                  <select className={`${inputClass} w-36`} value={section} onChange={(e) => setSection(e.target.value)}>
                    <option value="">All</option>
                    {sections.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {batches.length > 1 && (
                <label className="flex flex-col gap-1">
                  <span className="text-zinc-500">Batch</span>
                  <select className={`${inputClass} w-28`} value={batch} onChange={(e) => setBatch(e.target.value)}>
                    <option value="">All</option>
                    {batches.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {filtering && <span className="pb-2 text-zinc-500">{rows.length} participants</span>}
              {contest.viewer.canManage && (
                // সবসময় freeze ছাড়া আসল ফল — মার্কস দেওয়ার জন্য
                <a href={`/api/contests/${encodeURIComponent(slug)}/standings.csv`} className={`${secondaryButtonClass} ml-auto`}>
                  ⬇ Export CSV (Excel)
                </a>
              )}
            </div>
          )}
          {data.rows.length === 0 ? (
            <p className="text-zinc-500">Nobody has registered yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
              <table className="w-full border-collapse text-center text-sm">
                <thead className="bg-black/[.03] text-zinc-500 dark:bg-white/[.04]">
                  <tr>
                    <th className="px-2 py-2 font-medium">#</th>
                    <th className="px-3 py-2 text-left font-medium">Participant</th>
                    <th className="px-2 py-2 font-medium">{data.scoring === "ICPC" ? "Solved" : "Score"}</th>
                    {data.scoring === "ICPC" && <th className="px-2 py-2 font-medium">Penalty</th>}
                    {data.problems.map((p) => (
                      <th key={p.label} className="min-w-14 px-2 py-2 font-medium" title={p.title}>
                        <div className="text-foreground">{p.label}</div>
                        <div className="text-[11px] font-normal">
                          {p.solvedBy}/{p.triedBy}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.username}
                      className={`border-t border-black/10 dark:border-white/10 ${
                        r.username === user?.username ? "bg-amber-400/15" : ""
                      }`}
                    >
                      <td className="px-2 py-1.5 font-medium">
                        {filtering ? r.localRank : r.rank}
                        {filtering && <div className="text-[11px] font-normal text-zinc-500">({r.rank})</div>}
                      </td>
                      <td className="px-3 py-1.5 text-left">
                        <div className="font-medium">{r.username}</div>
                        {(r.displayName || r.section || r.batch) && (
                          <div className="text-xs text-zinc-500">
                            {[r.displayName, r.batch && `Batch ${r.batch}`, r.section && `Sec ${r.section}`].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-1.5 font-semibold">{r.points}</td>
                      {data.scoring === "ICPC" && <td className="px-2 py-1.5">{r.penalty}</td>}
                      {data.problems.map((p) => (
                        <Cell key={p.label} cell={r.cells[p.label]!} scoring={data.scoring} />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-zinc-500">
            Updated {new Date(data.generatedAt).toLocaleTimeString()}
            {phase === "RUNNING" && " · refreshes every 30 seconds"}
            {data.scoring === "ICPC" && " · penalty = solve minute + wrong submissions × penalty (compile errors are free)"}
          </p>
        </>
      )}
    </div>
  );
}

function Cell({ cell, scoring }: { cell: StandingsCell; scoring: ScoringType }) {
  const pending = cell.pending > 0 && <div className="text-xs font-semibold text-sky-600 dark:text-sky-400">?{cell.pending}</div>;

  if (scoring === "IOI") {
    if (cell.score === null) return <td className="px-2 py-1.5">{pending}</td>;
    const color =
      cell.score === 100
        ? "bg-green-600/15 text-green-700 dark:text-green-400"
        : cell.score > 0
          ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
          : "bg-red-600/10 text-red-700 dark:text-red-400";
    return (
      <td className={`px-2 py-1.5 font-semibold ${color}`}>
        {cell.score}
        {pending}
      </td>
    );
  }

  if (cell.solved) {
    return (
      <td
        className={`px-2 py-1.5 ${
          cell.firstSolve ? "bg-green-700 text-white" : "bg-green-600/15 text-green-700 dark:text-green-400"
        }`}
        title={cell.firstSolve ? "First to solve" : undefined}
      >
        <div className="font-semibold">+{cell.wrong || ""}</div>
        <div className="text-xs opacity-80">{cell.solvedAtMinute}</div>
      </td>
    );
  }
  if (cell.wrong > 0 || cell.pending > 0) {
    return (
      <td className={`px-2 py-1.5 ${cell.wrong > 0 ? "bg-red-600/10 text-red-700 dark:text-red-400" : ""}`}>
        {cell.wrong > 0 && <div className="font-semibold">-{cell.wrong}</div>}
        {pending}
      </td>
    );
  }
  return <td className="px-2 py-1.5" />;
}
