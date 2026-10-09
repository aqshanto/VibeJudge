import { Suspense } from "react";
import { ContestOverview } from "./contest-overview";

export default function ContestPage({ params }: PageProps<"/contests/[slug]">) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        {params.then(({ slug }) => (
          <ContestOverview slug={slug} />
        ))}
      </Suspense>
    </main>
  );
}
