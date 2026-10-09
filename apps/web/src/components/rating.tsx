// Rating-এর রং (Codeforces-এর মতো), রঙিন নাম, আর প্রোফাইলের ইতিহাসের গ্রাফ।

import Link from "next/link";
import { RATING_TIERS, ratingTier, type RatingColor, type RatingHistoryEntry } from "@vibejudge/shared";

const TEXT: Record<RatingColor, string> = {
  red: "text-red-600 dark:text-red-400",
  orange: "text-orange-500 dark:text-orange-400",
  violet: "text-violet-600 dark:text-violet-400",
  blue: "text-blue-600 dark:text-blue-400",
  cyan: "text-cyan-600 dark:text-cyan-400",
  green: "text-green-600 dark:text-green-400",
  gray: "text-zinc-500 dark:text-zinc-400",
};

// গ্রাফের পেছনের রঙিন ফিতে (হালকা)
const BAND: Record<RatingColor, string> = {
  red: "#ef444422",
  orange: "#f9731622",
  violet: "#8b5cf622",
  blue: "#3b82f622",
  cyan: "#06b6d422",
  green: "#22c55e22",
  gray: "#71717a22",
};

export function ratingTextClass(rating: number | null | undefined): string {
  return rating == null ? "" : TEXT[ratingTier(rating).color];
}

/** rating অনুযায়ী রঙিন username (unrated হলে সাধারণ) */
export function RatedName({
  username,
  rating,
  link = true,
  className = "",
}: {
  username: string;
  rating: number | null | undefined;
  link?: boolean;
  className?: string;
}) {
  const cls = `${ratingTextClass(rating)} ${className}`;
  const title = rating == null ? undefined : `${ratingTier(rating).title} · ${rating}`;
  return link ? (
    <Link href={`/users/${username}`} className={`${cls} hover:underline`} title={title}>
      {username}
    </Link>
  ) : (
    <span className={cls} title={title}>
      {username}
    </span>
  );
}

/** "+45" সবুজ / "−30" লাল */
export function RatingDelta({ from, to }: { from: number; to: number }) {
  const d = to - from;
  return (
    <span
      className={`font-mono text-xs ${d >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
      title={`${from} → ${to}`}
    >
      {d >= 0 ? `+${d}` : `−${-d}`}
    </span>
  );
}

/** rating-এর ইতিহাস: পেছনে পদবির রঙিন ফিতে, উপরে রেখা আর প্রতিটা কনটেস্টে একটা বিন্দু */
export function RatingChart({ history }: { history: RatingHistoryEntry[] }) {
  if (history.length === 0) return null;
  const W = 640;
  const H = 220;
  const pad = { l: 40, r: 12, t: 10, b: 22 };
  const values = [history[0]!.oldRating, ...history.map((h) => h.newRating)];
  const lo = Math.floor((Math.min(...values) - 100) / 100) * 100;
  const hi = Math.ceil((Math.max(...values) + 100) / 100) * 100;
  const y = (r: number) => pad.t + ((hi - r) / (hi - lo)) * (H - pad.t - pad.b);
  const x = (i: number) => pad.l + (history.length === 1 ? (W - pad.l - pad.r) / 2 : (i / (history.length - 1)) * (W - pad.l - pad.r));
  const points = history.map((h, i) => [x(i), y(h.newRating)] as const);

  // পদবির ফিতে (নিচ থেকে উপরে)
  const bands = [...RATING_TIERS].reverse().map((t, i, all) => {
    const top = all[i + 1]?.min ?? Infinity;
    const from = Math.max(t.min, lo);
    const to = Math.min(top, hi);
    return to > from ? { color: t.color, y1: y(to), y2: y(from) } : null;
  });
  const ticks = Array.from({ length: Math.floor((hi - lo) / 100) + 1 }, (_, i) => lo + i * 100).filter(
    (_, i, a) => a.length <= 8 || i % Math.ceil(a.length / 8) === 0,
  );

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Rating history">
      {bands.map(
        (b, i) =>
          b && <rect key={i} x={pad.l} y={b.y1} width={W - pad.l - pad.r} height={b.y2 - b.y1} fill={BAND[b.color]} />,
      )}
      {ticks.map((t) => (
        <text key={t} x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize="11" className="fill-zinc-500">
          {t}
        </text>
      ))}
      <polyline
        points={points.map(([px, py]) => `${px},${py}`).join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-zinc-700 dark:text-zinc-300"
      />
      {points.map(([px, py], i) => (
        <circle key={i} cx={px} cy={py} r="4" className="fill-amber-500">
          <title>
            {history[i]!.contest.title}: {history[i]!.oldRating} → {history[i]!.newRating} (rank {history[i]!.rank})
          </title>
        </circle>
      ))}
    </svg>
  );
}
