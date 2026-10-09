"use client";

import { useEffect, useState } from "react";
import type { ProblemView as Problem } from "@vibejudge/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ProblemBody, SubmitForm } from "@/components/problem-parts";
import { SubmissionTable } from "@/components/submission-table";

export function ProblemView({ slug }: { slug: string }) {
  const [problem, setProblem] = useState<Problem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const { user } = useAuth();

  useEffect(() => {
    api<Problem>(`/problems/${encodeURIComponent(slug)}`).then(setProblem, (e: Error) => setError(e.message));
  }, [slug]);

  if (error) return <p className="text-red-600">Could not load problem: {error}</p>;
  if (!problem) return <p className="text-zinc-500">Loading… (a sleeping server can take up to a minute)</p>;

  return (
    <div className="flex flex-col gap-8">
      {problem.visibility !== "PUBLIC" && (
        <p className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          This problem is {problem.visibility.toLowerCase()} — only you and admins can see it. Submit here to test your
          tests and checker before publishing.
        </p>
      )}
      <ProblemBody problem={problem} />

      <SubmitForm
        draftId={problem.slug}
        loginNext={`/problems/${problem.slug}`}
        onSubmit={async (language, source) => {
          const { id } = await api<{ id: string }>("/submissions", {
            method: "POST",
            body: { problemSlug: problem.slug, language, source },
          });
          setRefresh((n) => n + 1);
          return id;
        }}
      />

      {user && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">My submissions</h2>
          <SubmissionTable
            query={`mine=true&problem=${encodeURIComponent(problem.slug)}&limit=20`}
            showProblem={false}
            showUser={false}
            refreshKey={refresh}
            emptyText="You haven't submitted to this problem yet."
          />
        </section>
      )}
    </div>
  );
}
