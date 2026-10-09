"use client";

import { useEffect, useState } from "react";
import { INITIAL_RATING, RATING_TIERS, ratingTier, type RatingRow } from "@vibejudge/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { RatedName, ratingTextClass } from "@/components/rating";

export function RatingsTable() {
  const { user } = useAuth();
  const [rows, setRows] = useState<RatingRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ users: RatingRow[] }>("/ratings").then(
      (r) => setRows(r.users),
      (e: Error) => setError(e.message),
    );
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Ratings</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Everyone starts at {INITIAL_RATING}. After a rated contest, your rating goes up if you did better than
          expected for your rating, and down if worse.
        </p>
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {[...RATING_TIERS].reverse().map((t) => (
            <span key={t.title} className={ratingTextClass(Number.isFinite(t.min) ? t.min : 0)}>
              {t.title}
              {Number.isFinite(t.min) ? ` ${t.min}+` : ""}
            </span>
          ))}
        </p>
      </header>

      {error && <p className="text-red-600">{error}</p>}
      {!rows && !error && <p className="text-zinc-500">Loading…</p>}
      {rows && rows.length === 0 && <p className="text-zinc-500">No rated contests yet.</p>}
      {rows && rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/[.03] text-zinc-500 dark:bg-white/[.04]">
              <tr>
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">User</th>
                <th className="px-3 py-2 font-medium">Title</th>
                <th className="px-3 py-2 text-right font-medium">Rating</th>
                <th className="px-3 py-2 text-right font-medium">Max</th>
                <th className="px-3 py-2 text-right font-medium">Contests</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.username}
                  className={`border-t border-black/10 dark:border-white/10 ${r.username === user?.username ? "bg-amber-400/15" : ""}`}
                >
                  <td className="px-3 py-2">{r.rank}</td>
                  <td className="px-3 py-2">
                    <RatedName username={r.username} rating={r.rating} className="font-medium" />
                    {r.displayName && <span className="ml-2 text-zinc-500">{r.displayName}</span>}
                  </td>
                  <td className={`px-3 py-2 ${ratingTextClass(r.rating)}`}>{ratingTier(r.rating).title}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${ratingTextClass(r.rating)}`}>{r.rating}</td>
                  <td className={`px-3 py-2 text-right ${ratingTextClass(r.maxRating)}`}>{r.maxRating}</td>
                  <td className="px-3 py-2 text-right">{r.contests}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
