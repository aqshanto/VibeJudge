import { Suspense } from "react";
import { TeamPage } from "./team-page";

export default function Page({ params }: PageProps<"/teams/[slug]">) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        {params.then(({ slug }) => (
          <TeamPage slug={slug} />
        ))}
      </Suspense>
    </main>
  );
}
