import { Suspense } from "react";
import { Profile } from "./profile";

export default function UserPage({ params }: PageProps<"/users/[username]">) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        {params.then(({ username }) => (
          <Profile username={username} />
        ))}
      </Suspense>
    </main>
  );
}
