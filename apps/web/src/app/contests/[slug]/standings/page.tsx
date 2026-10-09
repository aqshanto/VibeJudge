import { Suspense } from "react";
import { Standings } from "./standings";

export default function StandingsPage({ params }: PageProps<"/contests/[slug]/standings">) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        {params.then(({ slug }) => (
          <Standings slug={slug} />
        ))}
      </Suspense>
    </main>
  );
}
