"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface ProblemSummary {
  slug: string;
  title: string;
  timeLimitMs: number;
  memoryLimitKb: number;
}

export function ProblemList() {
  const [problems, setProblems] = useState<ProblemSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<ProblemSummary[]>("/problems").then(setProblems, (e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="text-red-600">Could not load problems: {error}</p>;
  if (!problems) return <p className="text-zinc-500">Loading… (a sleeping server can take up to a minute)</p>;
  if (problems.length === 0) return <p className="text-zinc-500">No problems yet.</p>;

  return (
    <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
      <table className="w-full text-left text-sm">
        <thead className="bg-black/[.03] text-zinc-500 dark:bg-white/[.04]">
          <tr>
            <th className="px-4 py-2 font-medium">Problem</th>
            <th className="px-4 py-2 font-medium">Time limit</th>
            <th className="px-4 py-2 font-medium">Memory limit</th>
          </tr>
        </thead>
        <tbody>
          {problems.map((p) => (
            <tr key={p.slug} className="border-t border-black/10 dark:border-white/10">
              <td className="px-4 py-2">
                <Link href={`/problems/${p.slug}`} className="font-medium text-sky-700 hover:underline dark:text-sky-400">
                  {p.title}
                </Link>
              </td>
              <td className="px-4 py-2">{p.timeLimitMs / 1000} s</td>
              <td className="px-4 py-2">{p.memoryLimitKb / 1024} MB</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
