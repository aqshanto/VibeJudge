import { Suspense } from "react";
import { ProblemView } from "./problem-view";

export default function ProblemPage({ params }: PageProps<"/problems/[slug]">) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        {params.then(({ slug }) => (
          <ProblemView slug={slug} />
        ))}
      </Suspense>
    </main>
  );
}
