import type { Visibility } from "@vibejudge/shared";

const STYLES: Record<Visibility, string> = {
  PRIVATE: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300",
  CONTEST: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  PUBLIC: "bg-green-600/15 text-green-700 dark:text-green-400",
};

export const VISIBILITY_HELP: Record<Visibility, string> = {
  PRIVATE: "Only you (and admins) can see and test it.",
  CONTEST: "Hidden from the archive; will be used inside contests (phase 3).",
  PUBLIC: "Listed in the problem archive — everyone can solve it.",
};

export function VisibilityBadge({ visibility }: { visibility: Visibility }) {
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${STYLES[visibility]}`}>
      {visibility.charAt(0) + visibility.slice(1).toLowerCase()}
    </span>
  );
}
