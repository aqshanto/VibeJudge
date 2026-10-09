"use client";

// নিজের Codeforces handle যুক্ত করা: handle দিলে একটা প্রবলেম পাই, সেখানে ১০ মিনিটের মধ্যে ইচ্ছা করে
// compile error জমা দিলে প্রমাণ হয় handle-টা নিজের।

import { useState } from "react";
import type { CodeforcesVerify } from "@vibejudge/shared";
import { api } from "@/lib/api";
import { formatCountdown, useServerNow } from "@/lib/time";
import { ErrorText, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";

export function CodeforcesLink({
  handle,
  verify,
  onChange,
}: {
  handle: string | null;
  verify: CodeforcesVerify | null;
  onChange: (handle: string | null, verify: CodeforcesVerify | null) => void;
}) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const now = useServerNow(undefined);
  const left = verify ? new Date(verify.expiresAt).getTime() - now : 0;

  async function run<T>(fn: () => Promise<T>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  if (handle) {
    return (
      <section className="flex flex-wrap items-center gap-3 rounded-lg border border-black/10 px-4 py-3 text-sm dark:border-white/15">
        <span>
          Codeforces:{" "}
          <a href={`https://codeforces.com/profile/${handle}`} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
            {handle} ↗
          </a>{" "}
          <span className="text-green-700 dark:text-green-400">✓ verified</span>
        </span>
        <button
          type="button"
          disabled={busy}
          className="ml-auto text-red-600 hover:underline"
          onClick={() => {
            if (window.confirm("Unlink this Codeforces handle?")) {
              void run(async () => {
                await api("/me/codeforces", { method: "DELETE" });
                onChange(null, null);
              });
            }
          }}
        >
          Unlink
        </button>
        <ErrorText>{error}</ErrorText>
      </section>
    );
  }

  if (verify && left > 0) {
    return (
      <section className="flex flex-col gap-3 rounded-lg border border-sky-500/40 bg-sky-500/5 p-4 text-sm">
        <h2 className="font-semibold">Verify your Codeforces handle “{verify.handle}”</h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            Log in to Codeforces as <b>{verify.handle}</b>.
          </li>
          <li>
            Open{" "}
            <a href={verify.url} target="_blank" rel="noopener noreferrer" className="font-medium text-sky-700 underline dark:text-sky-400">
              problem {verify.problem} ↗
            </a>{" "}
            and submit code that <b>does not compile</b> (for example just <code>hello</code>).
          </li>
          <li>Come back and press Check. Time left: {formatCountdown(left)}</li>
        </ol>
        <p className="text-xs text-zinc-500">This proves the handle is yours. A compilation error doesn&apos;t affect your Codeforces rating.</p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            className={buttonClass}
            onClick={() =>
              run(async () => {
                const r = await api<{ cfHandle: string }>("/me/codeforces/check", { method: "POST" });
                onChange(r.cfHandle, null);
              })
            }
          >
            {busy ? "Checking…" : "Check"}
          </button>
          <button type="button" disabled={busy} className={secondaryButtonClass} onClick={() => onChange(null, null)}>
            Use another handle
          </button>
        </div>
        <ErrorText>{error}</ErrorText>
      </section>
    );
  }

  return (
    <form
      className="flex flex-col gap-2 rounded-lg border border-black/10 p-4 text-sm dark:border-white/15"
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          const v = await api<CodeforcesVerify>("/me/codeforces/start", { method: "POST", body: { handle: input.trim() } });
          onChange(null, v);
        });
      }}
    >
      <h2 className="font-semibold">Codeforces handle</h2>
      <p className="text-zinc-500">
        Link your Codeforces account to take part in contests with Codeforces problems — your submissions there are picked
        up automatically.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          className={`${inputClass} min-w-0 flex-1`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Your Codeforces handle"
          maxLength={24}
          required
        />
        <button type="submit" disabled={busy || input.trim().length < 3} className={buttonClass}>
          {busy ? "Looking up…" : "Link"}
        </button>
      </div>
      <ErrorText>{error}</ErrorText>
    </form>
  );
}
