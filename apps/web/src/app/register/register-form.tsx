"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { PASSWORD_MIN_LENGTH, USERNAME_PATTERN, type AuthUser } from "@vibejudge/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ErrorText, Field, buttonClass, inputClass } from "@/components/ui";
import { GoogleButton, safeNext } from "../login/google-button";

export function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { setUser, googleEnabled } = useAuth();
  const [form, setForm] = useState({ email: "", username: "", displayName: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const next = safeNext(params.get("next"));

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: key === "username" ? e.target.value.toLowerCase() : e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user } = await api<{ user: AuthUser }>("/auth/register", {
        method: "POST",
        body: { ...form, displayName: form.displayName || undefined },
      });
      setUser(user);
      router.push(next);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {googleEnabled && (
        <>
          <GoogleButton />
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            <span className="h-px flex-1 bg-black/10 dark:bg-white/15" /> or <span className="h-px flex-1 bg-black/10 dark:bg-white/15" />
          </div>
        </>
      )}
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Email">
          <input className={inputClass} type="email" value={form.email} onChange={set("email")} autoComplete="email" required />
        </Field>
        <Field label="Username" hint="3–20 characters: a-z, 0-9, _ . -  (shown on standings)">
          <input
            className={inputClass}
            value={form.username}
            onChange={set("username")}
            pattern={USERNAME_PATTERN.slice(1, -1)}
            autoComplete="username"
            required
          />
        </Field>
        <Field label="Full name (optional)">
          <input className={inputClass} value={form.displayName} onChange={set("displayName")} autoComplete="name" />
        </Field>
        <Field label="Password" hint={`At least ${PASSWORD_MIN_LENGTH} characters`}>
          <input
            className={inputClass}
            type="password"
            value={form.password}
            onChange={set("password")}
            minLength={PASSWORD_MIN_LENGTH}
            autoComplete="new-password"
            required
          />
        </Field>
        <ErrorText>{error}</ErrorText>
        <button type="submit" disabled={busy} className={buttonClass}>
          {busy ? "Creating account…" : "Sign up"}
        </button>
      </form>
      <p className="text-sm text-zinc-500">
        Already have an account?{" "}
        <Link href="/login" className="text-sky-700 hover:underline dark:text-sky-400">
          Log in
        </Link>
      </p>
    </div>
  );
}
