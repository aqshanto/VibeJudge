"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { contestPhase, type ContestSummary } from "@vibejudge/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDateTime, formatDuration } from "@/lib/time";
import { buttonClass } from "@/components/ui";
import { PhaseBadge } from "./phase-badge";

type Scope = "current" | "past" | "managed";

export default function ContestsPage() {
  const { user } = useAuth();
  const [scope, setScope] = useState<Scope>("current");
  const [contests, setContests] = useState<ContestSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canManage = user?.role === "AUTHOR" || user?.role === "ADMIN";

  useEffect(() => {
    setContests(null);
    setError(null);
    api<{ contests: ContestSummary[] }>(`/contests?scope=${scope}`).then(
      (r) => setContests(r.contests),
      (e: Error) => setError(e.message),
    );
  }, [scope]);

  const tabs: { value: Scope; label: string }[] = [
    { value: "current", label: "Running & upcoming" },
    { value: "past", label: "Past" },
    ...(canManage ? [{ value: "managed" as const, label: "Created by me" }] : []),
  ];

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Contests</h1>
        {canManage && (
          <Link href="/contests/new" className={buttonClass}>
            New contest
          </Link>
        )}
      </div>
      <div className="mb-4 flex flex-wrap gap-1 text-sm">
        {tabs.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setScope(t.value)}
            className={`rounded-md px-3 py-1 ${scope === t.value ? "bg-foreground text-background" : "hover:bg-black/[.05] dark:hover:bg-white/[.08]"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="text-red-600">Could not load contests: {error}</p>}
      {!contests && !error && <p className="text-zinc-500">Loading…</p>}
      {contests?.length === 0 && <p className="text-zinc-500">No contests here.</p>}
      {contests && contests.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/[.03] text-zinc-500 dark:bg-white/[.04]">
              <tr>
                <th className="px-4 py-2 font-medium">Contest</th>
                <th className="px-4 py-2 font-medium">Start</th>
                <th className="px-4 py-2 font-medium">Length</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Participants</th>
              </tr>
            </thead>
            <tbody>
              {contests.map((c) => (
                <tr key={c.id} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-4 py-2">
                    <Link href={`/contests/${c.slug}`} className="font-medium text-sky-700 hover:underline dark:text-sky-400">
                      {c.title}
                    </Link>
                    <div className="text-xs text-zinc-500">
                      {c.scoring} {!c.isPublic && "· private"} {c.author && `· by ${c.author}`}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2">{formatDateTime(c.startsAt)}</td>
                  <td className="whitespace-nowrap px-4 py-2">
                    {formatDuration(c.durationMinutes)}
                    {c.type === "WINDOW" && <span className="text-zinc-500"> · window</span>}
                  </td>
                  <td className="px-4 py-2">
                    <PhaseBadge phase={contestPhase(c.startsAt, c.endsAt)} />
                  </td>
                  <td className="px-4 py-2">{c.participantCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
