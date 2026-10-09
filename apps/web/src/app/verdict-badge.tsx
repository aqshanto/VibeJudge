import { VERDICT_LABELS, type Verdict } from "@vibejudge/shared";

const COLORS: Record<Verdict, string> = {
  PENDING: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300",
  JUDGING: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  AC: "bg-green-600/15 text-green-700 dark:text-green-400",
  WA: "bg-red-600/15 text-red-700 dark:text-red-400",
  TLE: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  MLE: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  RE: "bg-fuchsia-600/15 text-fuchsia-700 dark:text-fuchsia-300",
  CE: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300",
  IE: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300",
};

export function VerdictBadge({ verdict, full = false }: { verdict: Verdict; full?: boolean }) {
  const busy = verdict === "PENDING" || verdict === "JUDGING";
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-sm font-semibold ${COLORS[verdict]}`}>
      {busy && <span className="mr-1.5 inline-block size-2 animate-pulse rounded-full bg-current" />}
      {full ? VERDICT_LABELS[verdict] : verdict}
    </span>
  );
}
