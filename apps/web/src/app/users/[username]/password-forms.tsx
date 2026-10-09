"use client";

import { useState } from "react";
import { PASSWORD_MIN_LENGTH } from "@vibejudge/shared";
import { api } from "@/lib/api";
import { ErrorText, Field, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";

/** নিজের পাসওয়ার্ড বদলানো (শুধু Google অ্যাকাউন্টে আগে পাসওয়ার্ড নেই — তখন "সেট করা") */
export function ChangePassword({ hasPassword }: { hasPassword: boolean }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={secondaryButtonClass} onClick={() => setOpen(true)}>
          {hasPassword ? "Change password" : "Set a password"}
        </button>
        {done && <span className="text-sm text-green-700 dark:text-green-400">{done}</span>}
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next !== repeat) return setError("The new passwords don't match");
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ otherSessionsRevoked: number }>("/users/me/password", {
        method: "POST",
        body: { current: hasPassword ? current : undefined, next },
      });
      setDone(
        `✓ Password changed.${r.otherSessionsRevoked ? ` Logged out ${r.otherSessionsRevoked} other device(s).` : ""}`,
      );
      setOpen(false);
      setCurrent("");
      setNext("");
      setRepeat("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid max-w-md gap-3 rounded-lg border border-black/10 p-4 dark:border-white/15">
      {hasPassword && (
        <Field label="Current password">
          <input className={inputClass} type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
        </Field>
      )}
      <Field label="New password" hint={`At least ${PASSWORD_MIN_LENGTH} characters`}>
        <input
          className={inputClass}
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          minLength={PASSWORD_MIN_LENGTH}
          autoComplete="new-password"
          required
        />
      </Field>
      <Field label="Repeat new password">
        <input className={inputClass} type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" required />
      </Field>
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <button type="submit" className={buttonClass} disabled={busy}>
          {busy ? "Saving…" : "Save password"}
        </button>
        <button type="button" className={secondaryButtonClass} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Admin: অন্য কারো পাসওয়ার্ড রিসেট — নতুন পাসওয়ার্ড শুধু এখানে একবার দেখায় */
export function AdminResetPassword({ username }: { username: string }) {
  const [password, setPassword] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reset() {
    if (!confirm(`Reset ${username}'s password? They will be logged out everywhere.`)) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ password: string }>(`/admin/users/${encodeURIComponent(username)}/reset-password`, { method: "POST" });
      setPassword(r.password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-amber-500/30 bg-amber-400/5 p-4">
      <p className="text-sm font-medium">Admin</p>
      {password ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          New password for <b>{username}</b>:
          <code className="rounded bg-black/[.06] px-2 py-1 font-mono text-base tracking-wider dark:bg-white/[.1]">{password}</code>
          <button type="button" className="text-sky-700 underline dark:text-sky-400" onClick={() => navigator.clipboard?.writeText(password)}>
            Copy
          </button>
          <span className="text-xs text-amber-700 dark:text-amber-400">Shown only once — give it to the student now.</span>
        </div>
      ) : (
        <button type="button" className={`${secondaryButtonClass} self-start`} disabled={busy} onClick={reset}>
          {busy ? "Resetting…" : "Reset password"}
        </button>
      )}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
