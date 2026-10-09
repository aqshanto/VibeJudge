import { Suspense } from "react";
import { PlagiarismReportView } from "./report";

export default function PlagiarismPage({ params }: PageProps<"/contests/[slug]/plagiarism">) {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        {params.then(({ slug }) => (
          <PlagiarismReportView slug={slug} />
        ))}
      </Suspense>
    </main>
  );
}
