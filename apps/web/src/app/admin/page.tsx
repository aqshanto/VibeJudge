"use client";

import { useCallback, useEffect, useState } from "react";
import type { AuthorRequestStatus, AuthorRequestView } from "@vibejudge/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { ErrorText, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";
import { BulkAccounts } from "./bulk-accounts";

const TABS: AuthorRequestStatus[] = ["PENDING", "APPROVED", "REJECTED"];

export default function AdminPage() {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState<AuthorRequestStatus>("PENDING");
  const [requests, setRequests] = useState<AuthorRequestView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRequests(null);
    setError(null);
    try {
      const r = await api<{ requests: AuthorRequestView[] }>(`/admin/author-requests?status=${tab}`);
      setRequests(r.requests);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [tab]);

  useEffect(() => {
    if (user?.role === "ADMIN") void load();
  }, [user, load]);

  async function review(id: string, action: "approve" | "reject") {
    setBusyId(id);
    try {
      await api(`/admin/author-requests/${id}/${action}`, { method: "POST" });
      setRequests((rs) => rs?.filter((r) => r.id !== id) ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <Shell>Loading…</Shell>;
  if (user?.role !== "ADMIN") return <Shell>Only admins can see this page.</Shell>;

  return (
    <Shell>
      <FindUser />

      <h2 className="mb-3 text-lg font-semibold">Author requests</h2>
      <div className="mb-4 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1 text-sm ${t === tab ? "bg-foreground text-background" : "hover:bg-black/[.05] dark:hover:bg-white/[.08]"}`}
          >
            {t.charAt(0) + t.slice(1).toLowerCase()}
          </button>
        ))}
      </div>
      <ErrorText>{error}</ErrorText>
      {!requests && !error && <p className="text-zinc-500">Loading…</p>}
      {requests?.length === 0 && <p className="text-zinc-500">Nothing here.</p>}
      <ul className="flex flex-col gap-3">
        {requests?.map((r) => (
          <li key={r.id} className="rounded-lg border border-black/10 p-4 dark:border-white/15">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium">
                {r.user.username}
                {r.user.displayName && <span className="font-normal text-zinc-500"> · {r.user.displayName}</span>}
              </p>
              <p className="text-xs text-zinc-500">{new Date(r.createdAt).toLocaleString()}</p>
            </div>
            <p className="text-sm text-zinc-500">{r.user.email}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm">{r.message}</p>
            {r.status === "PENDING" && (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={busyId === r.id}
                  onClick={() => review(r.id, "approve")}
                >
                  Approve
                </button>
                <button
                  type="button"
                  className={secondaryButtonClass}
                  disabled={busyId === r.id}
                  onClick={() => review(r.id, "reject")}
                >
                  Reject
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <section className="mt-12 border-t border-black/10 pt-8 dark:border-white/10">
        <h2 className="mb-3 text-lg font-semibold">Bulk accounts</h2>
        <BulkAccounts />
      </section>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold">Admin</h1>
      {children}
    </main>
  );
}

// username দিয়ে ছাত্র খুঁজে প্রোফাইলে যাওয়া (সেখানে পাসওয়ার্ড রিসেট করা যায়)
function FindUser() {
  const router = useRouter();
  const [name, setName] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) router.push(`/users/${encodeURIComponent(name.trim().toLowerCase())}`);
      }}
      className="mb-10 flex flex-wrap items-end gap-2"
    >
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Find a user</span>
        <input className={`${inputClass} w-64`} value={name} onChange={(e) => setName(e.target.value)} placeholder="username or student ID" />
      </label>
      <button type="submit" className={secondaryButtonClass}>
        Open profile
      </button>
      <span className="pb-2 text-xs text-zinc-500">Lost password? Open the profile and use “Reset password”.</span>
    </form>
  );
}
