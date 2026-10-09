"use client";

import Link from "next/link";
import type { ContestDetail, ContestPhase } from "@vibejudge/shared";
import { formatCountdown } from "@/lib/time";
import { PhaseBadge } from "../phase-badge";
import { useContestMessages } from "./use-messages";

type Messages = ReturnType<typeof useContestMessages>;

export function ContestHeader({
  contest,
  phase,
  now,
  active,
  messages: given,
}: {
  contest: ContestDetail;
  phase: ContestPhase;
  now: number;
  active: "overview" | "problem" | "standings" | "messages" | "plagiarism";
  /** Messages পেজ নিজের state দেয় (একই জিনিস দুবার না আনতে) */
  messages?: Messages;
}) {
  const own = useContestMessages(contest.slug, given ? null : phase);
  const msgs = given ?? own;

  const start = new Date(contest.startsAt).getTime();
  const end = start + contest.durationMinutes * 60_000;
  const freezeAt = end - contest.freezeMinutes * 60_000;
  const frozen = phase === "RUNNING" && contest.freezeMinutes > 0 && now >= freezeAt;

  const badge = contest.viewer.canManage ? msgs.unansweredCount : msgs.newAnnouncements.length + msgs.newAnswers.length;
  const latest = msgs.newAnnouncements[0];
  const link = (href: string, label: React.ReactNode, isActive: boolean) => (
    <Link href={href} className={isActive ? "font-medium" : "text-zinc-500 hover:text-foreground"}>
      {label}
    </Link>
  );

  return (
    <div className="flex flex-col gap-3 border-b border-black/10 pb-4 dark:border-white/10">
      {latest && active !== "messages" && (
        <div role="status" className="flex items-start gap-3 rounded-md bg-amber-400/20 px-3 py-2 text-sm">
          <span aria-hidden>📢</span>
          <p className="flex-1 whitespace-pre-wrap">
            <b>Announcement:</b> {latest.message}
            {msgs.newAnnouncements.length > 1 && ` (+${msgs.newAnnouncements.length - 1} more)`}
          </p>
          <Link href={`/contests/${contest.slug}/messages`} className="shrink-0 underline">
            Open
          </Link>
          <button type="button" className="shrink-0 text-zinc-600 dark:text-zinc-300" onClick={msgs.markSeen} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}
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
        <nav className="ml-auto flex flex-wrap gap-4">
          {link(`/contests/${contest.slug}`, "Problems", active === "overview")}
          {(phase !== "UPCOMING" || contest.viewer.canManage) &&
            link(`/contests/${contest.slug}/standings`, "Standings", active === "standings")}
          {link(
            `/contests/${contest.slug}/messages`,
            <>
              Messages
              {badge > 0 && (
                <span className="ml-1 rounded-full bg-red-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">{badge}</span>
              )}
            </>,
            active === "messages",
          )}
          {contest.viewer.canManage &&
            phase !== "UPCOMING" &&
            link(`/contests/${contest.slug}/plagiarism`, "Plagiarism", active === "plagiarism")}
          {contest.viewer.canManage && link(`/contests/${contest.slug}/edit`, "Edit", false)}
        </nav>
      </div>
    </div>
  );
}
