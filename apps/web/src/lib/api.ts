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

/**
 * `cache: "no-cache"` দিলে ব্রাউজার ETag পাঠিয়ে যাচাই করে — না বদলালে সার্ভার 304 দেয়
 * আর ব্রাউজার আগের কপি ব্যবহার করে (standings-এর মতো বড় ডেটার জন্য)।
 */
export async function api<T>(
  path: string,
  init?: { method?: string; body?: unknown; cache?: RequestCache },
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init?.method ?? "GET",
    headers: init?.body ? { "content-type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: init?.cache ?? "no-store",
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
