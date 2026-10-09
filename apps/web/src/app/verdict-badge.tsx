import { VERDICT_LABELS, type JudgeProgress, type Verdict } from "@vibejudge/shared";

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

/** judge শেষ না হলে কী লেখা হবে: "In queue · #3", "Compiling…", "Running 4/10" */
export function busyLabel(verdict: Verdict, progress?: JudgeProgress | null, queuePosition?: number | null): string {
  if (verdict === "PENDING") return queuePosition ? `In queue · #${queuePosition}` : "In queue";
  if (progress?.phase === "compiling") return "Compiling…";
  if (progress?.phase === "running" && progress.total > 0) return `Running ${progress.done}/${progress.total}`;
  return "Judging…";
}

export function VerdictBadge({
  verdict,
  full = false,
  progress,
  queuePosition,
}: {
  verdict: Verdict;
  full?: boolean;
  progress?: JudgeProgress | null;
  queuePosition?: number | null;
}) {
  const busy = verdict === "PENDING" || verdict === "JUDGING";
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded px-2 py-0.5 text-sm font-semibold ${COLORS[verdict]}`}>
      {busy && <Spinner />}
      {busy ? busyLabel(verdict, progress, queuePosition) : full ? VERDICT_LABELS[verdict] : verdict}
    </span>
  );
}

function Spinner() {
  return (
    <svg className="mr-1.5 size-3 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/**
 * সাবমিশন পেজের বড় অগ্রগতি বার।
 * টেস্ট চললে % দেখায়; লাইনে থাকা বা compile-এর সময় চলমান ডোরা (কতক্ষণ লাগবে জানা নেই)।
 */
export function JudgeProgressBar({
  verdict,
  progress,
  queuePosition,
}: {
  verdict: Verdict;
  progress: JudgeProgress | null;
  queuePosition: number | null;
}) {
  const running = verdict === "JUDGING" && progress?.phase === "running" && progress.total > 0;
  const percent = running ? Math.round((100 * progress!.done) / progress!.total) : null;

  let detail: string;
  if (verdict === "PENDING") {
    detail =
      queuePosition && queuePosition > 1
        ? `${queuePosition - 1} submission${queuePosition > 2 ? "s" : ""} ahead of yours`
        : "Yours is next";
  } else if (progress?.phase === "compiling") {
    detail = "Compiling your code";
  } else if (running) {
    detail = `Test ${Math.min(progress!.done + 1, progress!.total)} of ${progress!.total}`;
  } else {
    detail = "Checking your code";
  }

  return (
    <div className="flex max-w-xl flex-col gap-2" role="status" aria-live="polite">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{busyLabel(verdict, progress, queuePosition)}</span>
        <span className="text-zinc-500">
          {detail}
          {percent !== null && ` · ${percent}%`}
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/[.08] dark:bg-white/[.1]">
        {percent !== null ? (
          <div className="h-full rounded-full bg-sky-600 transition-[width] duration-500" style={{ width: `${Math.max(percent, 3)}%` }} />
        ) : (
          // কতক্ষণ লাগবে জানা নেই — এদিক-ওদিক চলা ডোরা
          <div className="vj-indeterminate h-full w-1/3 rounded-full bg-sky-600/70" />
        )}
      </div>
    </div>
  );
}
