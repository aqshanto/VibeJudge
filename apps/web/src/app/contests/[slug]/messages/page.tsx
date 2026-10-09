import { Suspense } from "react";
import { MessagesView } from "./messages-view";

export default function MessagesPage({ params }: PageProps<"/contests/[slug]/messages">) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        {params.then(({ slug }) => (
          <MessagesView slug={slug} />
        ))}
      </Suspense>
    </main>
  );
}
