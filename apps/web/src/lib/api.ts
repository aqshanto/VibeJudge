// ব্রাউজার থেকে API কল। "/api/*" Next-এর rewrite দিয়ে Render-এ যায়।

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// Render-এর ফ্রি সার্ভার ঘুম থেকে উঠতে ~৫০ সেকেন্ড লাগতে পারে
const TIMEOUT_MS = 70_000;

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init?.method ?? "GET",
    headers: init?.body ? { "content-type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const data = (await res.json()) as { error?: string; message?: string };
      message = data.error ?? data.message ?? message;
    } catch {}
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}
