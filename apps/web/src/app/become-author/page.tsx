"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AuthorRequestView } from "@vibejudge/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card, ErrorText, Field, buttonClass, inputClass } from "@/components/ui";

export default function BecomeAuthorPage() {
  const { user, loading } = useAuth();
  const [request, setRequest] = useState<AuthorRequestView | null | undefined>(undefined);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    api<{ request: AuthorRequestView | null }>("/author-requests/mine").then(
      (r) => setRequest(r.request),
      (e: Error) => setError(e.message),
    );
  }, [user]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ request: AuthorRequestView }>("/author-requests", { method: "POST", body: { message } });
      setRequest(r.request);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  let content: React.ReactNode;
  if (loading || (user && request === undefined && !error)) {
    content = <p className="text-zinc-500">Loading…</p>;
  } else if (!user) {
    content = (
      <p>
        Please{" "}
        <Link href="/login?next=/become-author" className="text-sky-700 hover:underline dark:text-sky-400">
          log in
        </Link>{" "}
        first.
      </p>
    );
  } else if (user.role !== "USER") {
    content = <p>You are already an {user.role.toLowerCase()} — you can create problems and contests.</p>;
  } else if (request?.status === "PENDING") {
    content = (
      <Card>
        <p className="font-medium">Your request is waiting for an admin to review it.</p>
        <p className="mt-2 text-sm text-zinc-500">Sent {new Date(request.createdAt).toLocaleString()}</p>
        <blockquote className="mt-3 border-l-2 border-black/15 pl-3 text-sm dark:border-white/20">{request.message}</blockquote>
      </Card>
    );
  } else {
    content = (
      <form onSubmit={submit} className="flex flex-col gap-4">
        {request?.status === "REJECTED" && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Your previous request was not approved. You can send a new one.
          </p>
        )}
        <Field label="Why do you want to be an author?" hint="E.g. which course or contest you will set problems for.">
          <textarea
            className={`${inputClass} h-32`}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            minLength={10}
            maxLength={1000}
            required
          />
        </Field>
        <ErrorText>{error}</ErrorText>
        <button type="submit" disabled={busy} className={`${buttonClass} self-start`}>
          {busy ? "Sending…" : "Send request"}
        </button>
      </form>
    );
  }

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-12">
      <h1 className="mb-2 text-2xl font-semibold">Become an author</h1>
      <p className="mb-6 text-zinc-600 dark:text-zinc-400">
        Authors can create problems and host contests. An admin reviews every request.
      </p>
      {content}
    </main>
  );
}
