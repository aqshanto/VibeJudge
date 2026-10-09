import { Suspense } from "react";
import { ContestProblem } from "./contest-problem";

export default function ContestProblemPage({ params }: PageProps<"/contests/[slug]/problems/[label]">) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        {params.then(({ slug, label }) => (
          <ContestProblem slug={slug} label={label.toUpperCase()} />
        ))}
      </Suspense>
    </main>
  );
}
