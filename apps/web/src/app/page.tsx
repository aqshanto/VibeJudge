import { APP_NAME } from "@vibejudge/shared";
import { ApiStatus } from "./api-status";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-8 px-4 py-16">
      <div className="flex flex-col gap-3">
        <h1 className="text-4xl font-semibold tracking-tight">{APP_NAME}</h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          An online judge for programming contests. Coming soon.
        </p>
      </div>
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">System status</h2>
        <ApiStatus />
      </section>
    </main>
  );
}
