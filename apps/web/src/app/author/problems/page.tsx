"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SLUG_PATTERN, type AuthorProblemSummary } from "@vibejudge/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ErrorText, Field, buttonClass, inputClass } from "@/components/ui";
import { VisibilityBadge } from "./visibility-badge";

/** "A + B Problem" → "a-b-problem" */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export default function AuthorProblemsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [problems, setProblems] = useState<AuthorProblemSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [creating, setCreating] = useState(false);

  const canAuthor = user?.role === "AUTHOR" || user?.role === "ADMIN";

  useEffect(() => {
    if (!canAuthor) return;
    api<{ problems: AuthorProblemSummary[] }>("/author/problems").then(
      (r) => setProblems(r.problems),
      (e: Error) => setError(e.message),
    );
  }, [canAuthor]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const { id } = await api<{ id: string }>("/author/problems", { method: "POST", body: { title, slug } });
      router.push(`/author/problems/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setCreating(false);
    }
  }

  if (loading) return <Shell>Loading…</Shell>;
  if (!canAuthor) {
    return (
      <Shell>
        Only authors can create problems.{" "}
        <Link href="/become-author" className="text-sky-700 hover:underline dark:text-sky-400">
          Request author access
        </Link>
      </Shell>
    );
  }

  return (
    <Shell>
      <form onSubmit={create} className="mb-10 grid gap-3 rounded-lg border border-black/10 p-4 sm:grid-cols-[2fr_1.5fr_auto] sm:items-end dark:border-white/15">
        <Field label="New problem title">
          <input
            className={inputClass}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (!slugEdited) setSlug(slugify(e.target.value));
            }}
            maxLength={100}
            required
          />
        </Field>
        <Field label="Short name (URL)">
          <input
            className={inputClass}
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value.toLowerCase());
              setSlugEdited(true);
            }}
            pattern={SLUG_PATTERN.slice(1, -1)}
            title="3–40 characters: a-z, 0-9 and -"
            required
          />
        </Field>
        <button type="submit" disabled={creating} className={buttonClass}>
          {creating ? "Creating…" : "Create"}
        </button>
      </form>
      <ErrorText>{error}</ErrorText>

      {!problems && !error && <p className="text-zinc-500">Loading…</p>}
      {problems?.length === 0 && <p className="text-zinc-500">You have no problems yet.</p>}
      {problems && problems.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/[.03] text-zinc-500 dark:bg-white/[.04]">
              <tr>
                <th className="px-4 py-2 font-medium">Problem</th>
                <th className="px-4 py-2 font-medium">Visibility</th>
                <th className="px-4 py-2 font-medium">Tests</th>
                {user?.role === "ADMIN" && <th className="px-4 py-2 font-medium">Author</th>}
                <th className="px-4 py-2 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {problems.map((p) => (
                <tr key={p.id} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-4 py-2">
                    <Link href={`/author/problems/${p.id}`} className="font-medium text-sky-700 hover:underline dark:text-sky-400">
                      {p.title}
                    </Link>
                    <span className="ml-2 font-mono text-xs text-zinc-500">{p.slug}</span>
                  </td>
                  <td className="px-4 py-2">
                    <VisibilityBadge visibility={p.visibility} />
                  </td>
                  <td className="px-4 py-2">{p.testCount}</td>
                  {user?.role === "ADMIN" && <td className="px-4 py-2">{p.author ?? "—"}</td>}
                  <td className="whitespace-nowrap px-4 py-2 text-zinc-500">{new Date(p.updatedAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold">My problems</h1>
      {children}
    </main>
  );
}
