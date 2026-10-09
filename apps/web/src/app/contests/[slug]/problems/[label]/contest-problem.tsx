"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ContestProblemView } from "@vibejudge/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ProblemBody, SubmitForm } from "@/components/problem-parts";
import { SubmissionTable } from "@/components/submission-table";
import { ContestHeader } from "../../contest-header";
import { useContest } from "../../use-contest";

export function ContestProblem({ slug, label }: { slug: string; label: string }) {
  const { contest, phase, personal, now, error: contestError } = useContest(slug);
  const { user } = useAuth();
  const [problem, setProblem] = useState<ContestProblemView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  // phase বা নিজের ঘড়ি বদলালে (যেমন শুরু হলে, Start চাপলে) আবার চেষ্টা করি
  useEffect(() => {
    setError(null);
    api<ContestProblemView>(`/contests/${encodeURIComponent(slug)}/problems/${encodeURIComponent(label)}`).then(
      setProblem,
      (e: Error) => setError(e.message),
    );
  }, [slug, label, phase, personal]);

  if (contestError) return <p className="text-red-600">Could not load contest: {contestError}</p>;
  if (!contest || !phase) return <p className="text-zinc-500">Loading…</p>;

  return (
    <div className="flex flex-col gap-8">
      <ContestHeader contest={contest} phase={phase} now={now} active="problem" />

      {contest.problems.length > 0 && (
        <nav className="flex flex-wrap gap-1.5">
          {contest.problems.map((p) => (
            <Link
              key={p.label}
              href={`/contests/${contest.slug}/problems/${p.label}`}
              title={p.title}
              className={`flex size-9 items-center justify-center rounded-md border text-sm font-semibold ${
                p.label === label
                  ? "border-foreground bg-foreground text-background"
                  : "border-black/15 hover:bg-black/[.04] dark:border-white/20 dark:hover:bg-white/[.06]"
              }`}
            >
              {p.label}
            </Link>
          ))}
        </nav>
      )}

      {error && <p className="text-red-600">{error}</p>}
      {!problem && !error && <p className="text-zinc-500">Loading…</p>}
      {problem && (
        <>
          {/* শেষ হলে (upsolve) সব ভাষা; তার আগে author-এর বাছাই করা */}
          <ProblemBody
            problem={problem}
            titlePrefix={problem.label}
            languages={phase === "ENDED" ? undefined : contest.languages}
          />
          <SubmitForm
            draftId={`${contest.slug}/${problem.label}`}
            languages={phase === "ENDED" ? undefined : contest.languages}
            loginNext={`/contests/${contest.slug}/problems/${problem.label}`}
            note={
              contest.viewer.participation?.virtual && personal === "RUNNING" ? (
                <p className="text-sm text-zinc-500">Virtual participation — this counts in your virtual row of the standings.</p>
              ) : phase === "ENDED" ? (
                <p className="text-sm text-zinc-500">The contest is over — this submission is practice and won&apos;t change the standings.</p>
              ) : contest.viewer.canManage && !contest.viewer.registered ? (
                <p className="text-sm text-zinc-500">You manage this contest — your submissions are tests and won&apos;t appear in the standings.</p>
              ) : null
            }
            onSubmit={async (language, source) => {
              const { id } = await api<{ id: string }>(`/contests/${contest.slug}/submissions`, {
                method: "POST",
                body: { label: problem.label, language, source },
              });
              setRefresh((n) => n + 1);
              return id;
            }}
          />
          {user && (
            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold">My submissions to {problem.label}</h2>
              <SubmissionTable
                query={`mine=true&contest=${encodeURIComponent(contest.slug)}&problem=${encodeURIComponent(problem.slug)}&limit=20`}
                showUser={false}
                showProblem={false}
                refreshKey={refresh}
                emptyText="No submissions yet."
              />
            </section>
          )}
        </>
      )}
    </div>
  );
}
