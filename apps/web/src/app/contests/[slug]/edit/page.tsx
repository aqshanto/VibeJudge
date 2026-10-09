import { Suspense } from "react";
import { ContestForm } from "../../contest-form";

export default function EditContestPage({ params }: PageProps<"/contests/[slug]/edit">) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold">Edit contest</h1>
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        {params.then(({ slug }) => (
          <ContestForm slug={slug} />
        ))}
      </Suspense>
    </main>
  );
}
