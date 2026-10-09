// ছোট, বারবার লাগে এমন UI টুকরো (ফর্ম ইনপুট, বাটন ইত্যাদি)

export const inputClass =
  "w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-sky-600 dark:border-white/20";

export const buttonClass =
  "inline-flex items-center justify-center rounded-md bg-foreground px-5 py-2 text-sm font-medium text-background disabled:opacity-40";

export const secondaryButtonClass =
  "inline-flex items-center justify-center rounded-md border border-black/15 px-5 py-2 text-sm font-medium hover:bg-black/[.04] disabled:opacity-40 dark:border-white/20 dark:hover:bg-white/[.06]";

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}

export function ErrorText({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-sm text-red-600">
      {children}
    </p>
  );
}

export function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-black/10 p-6 dark:border-white/15">{children}</div>;
}
