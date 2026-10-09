"use client";

import { useEffect, useState } from "react";
import type { HealthResponse } from "@vibejudge/shared";

type State =
  | { kind: "loading" }
  | { kind: "ok"; health: HealthResponse }
  | { kind: "error"; message: string };

const DB_LABELS: Record<HealthResponse["database"], string> = {
  connected: "Connected",
  not_checked: "Not checked",
  not_configured: "Not configured",
  error: "Error",
};

export function ApiStatus() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    // Render-এর ফ্রি সার্ভার ঘুম থেকে উঠতে ~৫০ সেকেন্ড লাগতে পারে, তাই timeout বড় রাখা হলো।
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 70_000);

    fetch("/api/health?db=1", { signal: controller.signal, cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setState({ kind: "ok", health: (await res.json()) as HealthResponse });
      })
      .catch((err: unknown) => {
        setState({ kind: "error", message: err instanceof Error ? err.message : String(err) });
      })
      .finally(() => clearTimeout(timer));

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, []);

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-lg border border-black/10 p-5 text-sm dark:border-white/15">
      <dt className="text-zinc-500">API</dt>
      <dd className="font-medium">
        {state.kind === "loading" && "Checking… (a sleeping server can take up to a minute)"}
        {state.kind === "ok" && (state.health.status === "ok" ? "🟢 Online" : "🟡 Degraded")}
        {state.kind === "error" && `🔴 Unreachable (${state.message})`}
      </dd>
      {state.kind === "ok" && (
        <>
          <dt className="text-zinc-500">Database</dt>
          <dd className="font-medium">{DB_LABELS[state.health.database]}</dd>
          <dt className="text-zinc-500">Version</dt>
          <dd className="font-mono">{state.health.version}</dd>
        </>
      )}
    </dl>
  );
}
