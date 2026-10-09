import type { ContestPhase } from "@vibejudge/shared";

const STYLE: Record<ContestPhase, string> = {
  UPCOMING: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  RUNNING: "bg-green-600/15 text-green-700 dark:text-green-400",
  ENDED: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300",
};
const LABEL: Record<ContestPhase, string> = { UPCOMING: "Upcoming", RUNNING: "Running", ENDED: "Ended" };

export function PhaseBadge({ phase }: { phase: ContestPhase }) {
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${STYLE[phase]}`}>{LABEL[phase]}</span>;
}
