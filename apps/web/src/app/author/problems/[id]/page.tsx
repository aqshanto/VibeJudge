import { Suspense } from "react";
import { ProblemEditor } from "./problem-editor";

export default function EditProblemPage({ params }: PageProps<"/author/problems/[id]">) {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        {params.then(({ id }) => (
          <ProblemEditor id={id} />
        ))}
      </Suspense>
    </main>
  );
}
