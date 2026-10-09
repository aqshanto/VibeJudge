"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { TEAM_LIMITS, type TeamView } from "@vibejudge/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ErrorText, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";

/** আমার টিম, আসা invite, আর নতুন টিম বানানো */
export function MyTeams() {
  const { user, loading } = useAuth();
  const [teams, setTeams] = useState<TeamView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      setTeams((await api<{ teams: TeamView[] }>("/teams/mine")).teams);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (user) void reload();
  }, [user, reload]);

  if (loading) return <p className="text-zinc-500">Loading…</p>;
  if (!user) {
    return (
      <p>
        <Link href="/login?next=/teams" className="text-sky-700 hover:underline dark:text-sky-400">
          Log in
        </Link>{" "}
        to create or join a team.
      </p>
    );
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api<TeamView>("/teams", { method: "POST", body: { name } });
      setName("");
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  }

  async function respond(slug: string, action: "accept" | "leave") {
    setError(null);
    try {
      await api(`/teams/${slug}/${action}`, { method: "POST" });
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const invites = (teams ?? []).filter((t) => t.me && !t.me.accepted);
  const mine = (teams ?? []).filter((t) => t.me?.accepted);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold">Teams</h1>
        <p className="mt-1 text-sm text-zinc-500">
          A team is used for team contests. Create one, invite your teammates by username, and once they accept, any member
          can register the whole team. Up to {TEAM_LIMITS.maxMembers} members per team.
        </p>
      </header>

      {invites.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Invitations</h2>
          {invites.map((t) => (
            <div
              key={t.slug}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-sky-500/40 bg-sky-500/5 px-4 py-3 text-sm"
            >
              <span className="flex-1">
                <Link href={`/teams/${t.slug}`} className="font-medium hover:underline">
                  {t.name}
                </Link>{" "}
                <span className="text-zinc-500">
                  — invited by {t.members.find((m) => m.role === "OWNER")?.username ?? "the owner"}
                </span>
              </span>
              <button type="button" className={buttonClass} onClick={() => respond(t.slug, "accept")}>
                Accept
              </button>
              <button type="button" className={secondaryButtonClass} onClick={() => respond(t.slug, "leave")}>
                Decline
              </button>
            </div>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">My teams</h2>
        {teams === null ? (
          <p className="text-zinc-500">Loading…</p>
        ) : mine.length === 0 ? (
          <p className="text-zinc-500">You are not in a team yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {mine.map((t) => (
              <li key={t.slug} className="rounded-lg border border-black/10 px-4 py-3 text-sm dark:border-white/15">
                <Link href={`/teams/${t.slug}`} className="font-medium hover:underline">
                  {t.name}
                </Link>
                {t.me?.role === "OWNER" && <span className="ml-2 text-xs text-zinc-500">owner</span>}
                <div className="text-zinc-500">
                  {t.members
                    .map((m) => (m.accepted ? m.username : `${m.username} (invited)`))
                    .join(", ")}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form onSubmit={create} className="flex flex-col gap-3 rounded-lg border border-black/10 p-4 dark:border-white/15">
        <h2 className="font-semibold">Create a team</h2>
        <div className="flex flex-wrap gap-2">
          <input
            className={`${inputClass} min-w-0 flex-1`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Team name"
            maxLength={TEAM_LIMITS.nameMax}
            required
          />
          <button type="submit" disabled={busy || name.trim().length < 2} className={buttonClass}>
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
        <p className="text-xs text-zinc-500">You become the owner: you can invite and remove members.</p>
      </form>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
