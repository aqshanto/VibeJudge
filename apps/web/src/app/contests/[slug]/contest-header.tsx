"use client";

import Link from "next/link";
import type { ContestDetail, ContestPhase } from "@vibejudge/shared";
import { formatCountdown } from "@/lib/time";
import { PhaseBadge } from "../phase-badge";

export function ContestHeader({
  contest,
  phase,
  now,
  active,
}: {
  contest: ContestDetail;
  phase: ContestPhase;
  now: number;
  active: "overview" | "problem";
}) {
  const start = new Date(contest.startsAt).getTime();
  const end = start + contest.durationMinutes * 60_000;
  const freezeAt = end - contest.freezeMinutes * 60_000;
  const frozen = phase === "RUNNING" && contest.freezeMinutes > 0 && now >= freezeAt;

  return (
    <div className="flex flex-col gap-3 border-b border-black/10 pb-4 dark:border-white/10">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/contests/${contest.slug}`} className="text-2xl font-semibold hover:underline">
          {contest.title}
        </Link>
        <PhaseBadge phase={phase} />
        {frozen && (
          <span className="rounded bg-sky-500/15 px-2 py-0.5 text-xs font-medium text-sky-700 dark:text-sky-300">
            ❄ Standings frozen
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
        {phase === "UPCOMING" && (
          <span>
            Starts in <b className="font-mono">{formatCountdown(start - now)}</b>
          </span>
        )}
        {phase === "RUNNING" && (
          <span>
            Time left <b className="font-mono">{formatCountdown(end - now)}</b>
          </span>
        )}
        {phase === "ENDED" && <span className="text-zinc-500">The contest is over — you can still practice (upsolve).</span>}
        <nav className="ml-auto flex gap-4">
          <Link
            href={`/contests/${contest.slug}`}
            className={active === "overview" ? "font-medium" : "text-zinc-500 hover:text-foreground"}
          >
            Problems
          </Link>
          {contest.viewer.canManage && (
            <Link href={`/contests/${contest.slug}/edit`} className="text-zinc-500 hover:text-foreground">
              Edit
            </Link>
          )}
        </nav>
      </div>
    </div>
  );
}
