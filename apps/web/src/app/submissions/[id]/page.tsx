import { Suspense } from "react";
import { SubmissionView } from "./submission-view";

export default function SubmissionPage({ params }: PageProps<"/submissions/[id]">) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        {params.then(({ id }) => (
          <SubmissionView id={id} />
        ))}
      </Suspense>
    </main>
  );
}
