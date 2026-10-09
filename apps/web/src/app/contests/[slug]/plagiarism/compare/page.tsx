import { Suspense } from "react";
import { CompareView } from "./compare-view";

export default function ComparePage({ params }: PageProps<"/contests/[slug]/plagiarism/compare">) {
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10">
      {/* useSearchParams() Suspense-এর ভেতরে থাকতে হয় */}
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        {params.then(({ slug }) => (
          <CompareView slug={slug} />
        ))}
      </Suspense>
    </main>
  );
}
