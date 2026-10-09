"use client";

// GitHub-এর মতো activity heatmap: গত ৫৩ সপ্তাহ, প্রতিটা ঘর একটা দিন (বাংলাদেশ সময়ে)।

import { useMemo } from "react";
import { DISPLAY_TIME_ZONE, type ActivityDay } from "@vibejudge/shared";

const CELL = 11;
const GAP = 2;
const WEEKS = 53;
const DAY_MS = 86_400_000;

const LEVELS = [
  "fill-black/[.06] dark:fill-white/[.08]",
  "fill-green-300 dark:fill-green-900",
  "fill-green-500 dark:fill-green-700",
  "fill-green-600 dark:fill-green-500",
  "fill-green-800 dark:fill-green-300",
];
const level = (n: number) => (n === 0 ? 0 : n <= 2 ? 1 : n <= 5 ? 2 : n <= 9 ? 3 : 4);

/** "YYYY-MM-DD" → UTC midnight ms (শুধু তারিখের হিসাবের জন্য) */
const toMs = (date: string) => Date.parse(`${date}T00:00:00Z`);
const toDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function Heatmap({ activity }: { activity: ActivityDay[] }) {
  const { weeks, months, total, activeDays } = useMemo(() => {
    const byDate = new Map(activity.map((d) => [d.date, d]));
    // বাংলাদেশে আজ কোন তারিখ ("en-CA" ফরম্যাট = YYYY-MM-DD)
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: DISPLAY_TIME_ZONE }).format(new Date());
    const todayMs = toMs(today);
    // শেষ কলামে আজকের সপ্তাহ; প্রথম কলাম শুরু রবিবার থেকে
    const start = todayMs - (WEEKS - 1) * 7 * DAY_MS - new Date(todayMs).getUTCDay() * DAY_MS;

    const weeks: { date: string; n: number; ac: number; future: boolean }[][] = [];
    const months: { col: number; label: string }[] = [];
    for (let w = 0; w < WEEKS; w++) {
      const week = [];
      for (let d = 0; d < 7; d++) {
        const ms = start + (w * 7 + d) * DAY_MS;
        const date = toDate(ms);
        const day = byDate.get(date);
        week.push({ date, n: day?.submissions ?? 0, ac: day?.accepted ?? 0, future: ms > todayMs });
        // মাসের প্রথম দিন যে কলামে পড়ে সেখানে মাসের নাম
        if (date.endsWith("-01") && w > 0) {
          months.push({ col: w, label: new Date(ms).toLocaleString("en", { month: "short", timeZone: "UTC" }) });
        }
      }
      weeks.push(week);
    }
    const total = activity.reduce((s, d) => s + d.submissions, 0);
    return { weeks, months, total, activeDays: activity.filter((d) => d.submissions > 0).length };
  }, [activity]);

  const width = WEEKS * (CELL + GAP) + 24;
  const height = 7 * (CELL + GAP) + 18;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-semibold">
        {total} submissions in the last year
        <span className="ml-2 text-sm font-normal text-zinc-500">· active on {activeDays} days</span>
      </h2>
      <div className="overflow-x-auto">
        <svg width={width} height={height} role="img" aria-label={`${total} submissions in the last year`} className="text-[9px]">
          {months.map((m) => (
            <text key={`${m.col}-${m.label}`} x={24 + m.col * (CELL + GAP)} y={9} className="fill-zinc-500">
              {m.label}
            </text>
          ))}
          {["Mon", "Wed", "Fri"].map((d, i) => (
            <text key={d} x={0} y={18 + (1 + i * 2) * (CELL + GAP) + CELL - 2} className="fill-zinc-500">
              {d}
            </text>
          ))}
          {weeks.map((week, w) =>
            week.map((day, d) =>
              day.future ? null : (
                <rect
                  key={day.date}
                  x={24 + w * (CELL + GAP)}
                  y={18 + d * (CELL + GAP)}
                  width={CELL}
                  height={CELL}
                  rx={2}
                  className={LEVELS[level(day.n)]}
                >
                  <title>
                    {day.date}: {day.n === 0 ? "no submissions" : `${day.n} submissions, ${day.ac} accepted`}
                  </title>
                </rect>
              ),
            ),
          )}
        </svg>
      </div>
      <div className="flex items-center gap-1 self-end text-xs text-zinc-500">
        Less
        <svg width={5 * (CELL + GAP)} height={CELL}>
          {LEVELS.map((cls, i) => (
            <rect key={i} x={i * (CELL + GAP)} y={0} width={CELL} height={CELL} rx={2} className={cls} />
          ))}
        </svg>
        More
      </div>
    </section>
  );
}
