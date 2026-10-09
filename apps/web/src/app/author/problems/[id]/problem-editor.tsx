"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AuthorProblemDetail, ProblemUpdate } from "@vibejudge/shared";
import { api } from "@/lib/api";
import { VisibilityBadge } from "../visibility-badge";
import { StatementTab } from "./statement-tab";
import { SettingsTab } from "./settings-tab";
import { TestsTab } from "./tests-tab";
import { CheckerTab } from "./checker-tab";

const TABS = ["Statement", "Settings", "Tests", "Checker"] as const;
type Tab = (typeof TABS)[number];

export interface TabProps {
  problem: AuthorProblemDetail;
  /** PATCH করে নতুন অবস্থা বসায়; error হলে throw করে */
  save: (update: ProblemUpdate) => Promise<void>;
  setProblem: (p: AuthorProblemDetail) => void;
}

export function ProblemEditor({ id }: { id: string }) {
  const [problem, setProblem] = useState<AuthorProblemDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("Statement");

  useEffect(() => {
    api<AuthorProblemDetail>(`/author/problems/${encodeURIComponent(id)}`).then(setProblem, (e: Error) =>
      setError(e.message),
    );
  }, [id]);

  if (error) return <p className="text-red-600">Could not load problem: {error}</p>;
  if (!problem) return <p className="text-zinc-500">Loading…</p>;

  const save = async (update: ProblemUpdate) => {
    setProblem(await api<AuthorProblemDetail>(`/author/problems/${problem.id}`, { method: "PATCH", body: update }));
  };
  const props: TabProps = { problem, save, setProblem };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/author/problems" className="text-sm text-zinc-500 hover:underline">
          ← My problems
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{problem.title}</h1>
          <VisibilityBadge visibility={problem.visibility} />
          <Link
            href={`/problems/${problem.slug}`}
            className="ml-auto text-sm text-sky-700 hover:underline dark:text-sky-400"
            target="_blank"
          >
            Open problem page &amp; test-submit ↗
          </Link>
        </div>
        <p className="mt-1 text-sm text-zinc-500">
          {problem.tests.length} tests · {problem.timeLimitMs / 1000} s · {problem.memoryLimitKb / 1024} MB ·{" "}
          {problem.checkerSource ? "custom checker" : "default checker"}
        </p>
      </div>

      <nav className="flex gap-1 border-b border-black/10 dark:border-white/10">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm ${
              t === tab ? "border-foreground font-medium" : "border-transparent text-zinc-500 hover:text-foreground"
            }`}
          >
            {t}
            {t === "Tests" && <span className="ml-1 text-xs text-zinc-500">({problem.tests.length})</span>}
          </button>
        ))}
      </nav>

      {/* key দিলে ট্যাব বদলালে draft নতুন করে শুরু হয় */}
      {tab === "Statement" && <StatementTab key={problem.id} {...props} />}
      {tab === "Settings" && <SettingsTab key={problem.id} {...props} />}
      {tab === "Tests" && <TestsTab key={problem.id} {...props} />}
      {tab === "Checker" && <CheckerTab key={problem.id} {...props} />}
    </div>
  );
}

/** "Save" বাটন + ফলাফল মেসেজ */
export function useSaver() {
  const [state, setState] = useState<{ busy: boolean; message: string | null; error: string | null }>({
    busy: false,
    message: null,
    error: null,
  });
  const run = async (fn: () => Promise<void>, okMessage = "Saved") => {
    setState({ busy: true, message: null, error: null });
    try {
      await fn();
      setState({ busy: false, message: okMessage, error: null });
    } catch (e) {
      setState({ busy: false, message: null, error: (e as Error).message });
    }
  };
  return { ...state, run };
}

export function SaveStatus({ message, error }: { message: string | null; error: string | null }) {
  if (error) return <span className="text-sm text-red-600">{error}</span>;
  if (message) return <span className="text-sm text-green-700 dark:text-green-400">{message}</span>;
  return null;
}
