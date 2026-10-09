"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { TEAM_LIMITS, type TeamView } from "@vibejudge/shared";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/time";
import { ErrorText, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";

export function TeamPage({ slug }: { slug: string }) {
  const router = useRouter();
  const [team, setTeam] = useState<TeamView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      setTeam(await api<TeamView>(`/teams/${encodeURIComponent(slug)}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [slug]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (error) return <p className="text-red-600">Could not load team: {error}</p>;
  if (!team) return <p className="text-zinc-500">Loading…</p>;

  const owner = team.me?.role === "OWNER";
  const full = team.members.length >= TEAM_LIMITS.maxMembers;

  /** POST করে নতুন TeamView পেলে বসাই; `after` থাকলে সেখানে যাই */
  async function act(path: string, body?: object, after?: string) {
    setBusy(true);
    setActionError(null);
    try {
      const res = await api<TeamView | { ok: true }>(`/teams/${encodeURIComponent(slug)}${path}`, {
        method: path === "" ? "DELETE" : "POST",
        body,
      });
      if (after) return router.push(after);
      if ("slug" in res) setTeam(res);
      else await reload();
    } catch (err) {
      setActionError((err as Error).message);
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-sm text-zinc-500">
          <Link href="/teams" className="hover:underline">
            Teams
          </Link>
        </p>
        <h1 className="text-2xl font-semibold">{team.name}</h1>
        <p className="mt-1 text-sm text-zinc-500">Created {formatDateTime(team.createdAt)}</p>
      </header>

      {team.me && !team.me.accepted && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-sky-500/40 bg-sky-500/5 px-4 py-3 text-sm">
          <span className="flex-1">You have been invited to this team.</span>
          <button type="button" disabled={busy} className={buttonClass} onClick={() => act("/accept")}>
            Accept
          </button>
          <button type="button" disabled={busy} className={secondaryButtonClass} onClick={() => act("/leave", undefined, "/teams")}>
            Decline
          </button>
        </div>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Members</h2>
        <ul className="divide-y divide-black/10 rounded-lg border border-black/10 dark:divide-white/10 dark:border-white/15">
          {team.members.map((m) => (
            <li key={m.username} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <Link href={`/users/${m.username}`} className="font-medium hover:underline">
                {m.username}
              </Link>
              {m.displayName && <span className="text-zinc-500">{m.displayName}</span>}
              {m.role === "OWNER" && <span className="text-xs text-zinc-500">owner</span>}
              {!m.accepted && (
                <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-700 dark:text-amber-300">invited</span>
              )}
              {owner && m.role !== "OWNER" && (
                <button
                  type="button"
                  disabled={busy}
                  className="ml-auto text-xs text-red-600 hover:underline"
                  onClick={() => {
                    if (window.confirm(`Remove ${m.username} from the team?`)) void act("/remove", { username: m.username });
                  }}
                >
                  {m.accepted ? "Remove" : "Cancel invite"}
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {owner && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act("/invite", { username }).then(() => setUsername(""));
          }}
          className="flex flex-col gap-2"
        >
          <h2 className="text-lg font-semibold">Invite a teammate</h2>
          <div className="flex flex-wrap gap-2">
            <input
              className={`${inputClass} min-w-0 flex-1`}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Their username"
              disabled={full}
              required
            />
            <button type="submit" disabled={busy || full || !username.trim()} className={buttonClass}>
              Invite
            </button>
          </div>
          <p className="text-xs text-zinc-500">
            {full
              ? `The team is full (${TEAM_LIMITS.maxMembers} members).`
              : "They see the invitation on their Teams page and must accept it."}
          </p>
        </form>
      )}

      {team.contests.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Contests</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {team.contests.map((c) => (
              <li key={c.slug}>
                <Link href={`/contests/${c.slug}`} className="text-sky-700 hover:underline dark:text-sky-400">
                  {c.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {team.me?.accepted && (
        <div className="flex flex-wrap gap-3 border-t border-black/10 pt-4 text-sm dark:border-white/10">
          {owner ? (
            <button
              type="button"
              disabled={busy}
              className="text-red-600 hover:underline"
              onClick={() => {
                if (window.confirm(`Delete the team "${team.name}"?`)) void act("", undefined, "/teams");
              }}
            >
              Delete team
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              className="text-red-600 hover:underline"
              onClick={() => {
                if (window.confirm("Leave this team?")) void act("/leave", undefined, "/teams");
              }}
            >
              Leave team
            </button>
          )}
          <span className="text-zinc-500">
            Changing the team doesn&apos;t change contests it already registered for.
          </span>
        </div>
      )}
      <ErrorText>{actionError}</ErrorText>
    </div>
  );
}
