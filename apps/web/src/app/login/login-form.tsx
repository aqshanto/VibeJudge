"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { AuthUser } from "@vibejudge/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ErrorText, Field, buttonClass, inputClass } from "@/components/ui";
import { GoogleButton, safeNext } from "./google-button";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { setUser, googleEnabled } = useAuth();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(params.get("error"));
  const [busy, setBusy] = useState(false);
  const next = safeNext(params.get("next"));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user } = await api<{ user: AuthUser }>("/auth/login", { method: "POST", body: { login, password } });
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
        <Field label="Email or username">
          <input
            className={inputClass}
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            autoComplete="username"
            required
          />
        </Field>
        <Field label="Password">
          <input
            className={inputClass}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>
        <ErrorText>{error}</ErrorText>
        <button type="submit" disabled={busy} className={buttonClass}>
          {busy ? "Logging in…" : "Log in"}
        </button>
      </form>
      <p className="text-sm text-zinc-500">
        No account?{" "}
        <Link href={`/register${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-sky-700 hover:underline dark:text-sky-400">
          Sign up
        </Link>
      </p>
    </div>
  );
}
