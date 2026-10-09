"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { PlagiarismCompare } from "@vibejudge/shared";
import { api } from "@/lib/api";
import { VerdictBadge } from "@/app/verdict-badge";
import { similarityColor } from "../report";

export function CompareView({ slug }: { slug: string }) {
  const params = useSearchParams();
  const a = params.get("a") ?? "";
  const b = params.get("b") ?? "";
  const [data, setData] = useState<PlagiarismCompare | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<PlagiarismCompare>(
      `/contests/${encodeURIComponent(slug)}/plagiarism/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`,
    ).then(setData, (e: Error) => setError(e.message));
  }, [slug, a, b]);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!data) return <p className="text-zinc-500">Loading…</p>;

  return (
    <div className="flex flex-col gap-4">
      <Link href={`/contests/${slug}/plagiarism`} className="text-sm text-zinc-500 hover:underline">
        ← Plagiarism report
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Problem {data.label}</h1>
        <span className={`rounded px-2 py-0.5 font-semibold ${similarityColor(data.similarity)}`}>{data.similarity}% similar</span>
        <span className="text-sm text-zinc-500">Highlighted lines match the other code (names and comments ignored).</span>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <CodePane side={data.a} />
        <CodePane side={data.b} />
      </div>
    </div>
  );
}

function CodePane({ side }: { side: PlagiarismCompare["a"] }) {
  const marked = new Set(side.lines);
  const lines = side.source.replace(/\r\n?/g, "\n").split("\n");
  return (
    <div className="overflow-hidden rounded-lg border border-black/10 dark:border-white/15">
      <div className="flex items-center gap-2 border-b border-black/10 px-3 py-2 text-sm dark:border-white/15">
        <b>{side.username}</b>
        <VerdictBadge verdict={side.verdict} />
        <Link href={`/submissions/${side.submissionId}`} className="ml-auto text-sky-700 hover:underline dark:text-sky-400">
          submission
        </Link>
      </div>
      <pre className="max-h-[70vh] overflow-auto py-2 font-mono text-xs leading-5">
        {lines.map((text, i) => (
          <div key={i} className={`flex ${marked.has(i + 1) ? "bg-amber-400/25" : ""}`}>
            <span className="w-10 shrink-0 select-none pr-3 text-right text-zinc-400">{i + 1}</span>
            <span className="whitespace-pre pr-3">{text || " "}</span>
          </div>
        ))}
      </pre>
    </div>
  );
}
