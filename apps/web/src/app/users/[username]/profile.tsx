"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { contestPhase, ratingTier, type AuthUser, type ContestSummary, type ProfileUpdate, type UserProfile } from "@vibejudge/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDateTime } from "@/lib/time";
import { ErrorText, Field, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";
import { SubmissionTable } from "@/components/submission-table";
import { PhaseBadge } from "../../contests/phase-badge";
import { Heatmap } from "./heatmap";
import { CodeforcesLink } from "./codeforces-link";
import { RatingChart, RatingDelta, ratingTextClass } from "@/components/rating";
import { AdminResetPassword, ChangePassword } from "./password-forms";

export function Profile({ username }: { username: string }) {
  const { user: viewer } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    api<UserProfile>(`/users/${encodeURIComponent(username)}`).then(setProfile, (e: Error) => setError(e.message));
  }, [username]);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!profile) return <p className="text-zinc-500">Loading…</p>;

  const details = [profile.institution, profile.batch && `Batch ${profile.batch}`, profile.section && `Section ${profile.section}`]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-semibold ${ratingTextClass(profile.rating)}`}>
            {profile.username}
            {profile.role !== "USER" && (
              <span className="ml-2 rounded bg-sky-600/15 px-1.5 py-0.5 align-middle text-xs text-sky-700 dark:text-sky-300">
                {profile.role.toLowerCase()}
              </span>
            )}
          </h1>
          {profile.displayName && <p className="text-lg">{profile.displayName}</p>}
          {details && <p className="text-sm text-zinc-500">{details}</p>}
          <p className="text-sm text-zinc-500">Joined {new Date(profile.joinedAt).toLocaleDateString()}</p>
        </div>
        {profile.isMe && !editing && (
          <button type="button" className={secondaryButtonClass} onClick={() => setEditing(true)}>
            Edit profile
          </button>
        )}
      </header>

      {editing && (
        <EditProfile
          profile={profile}
          onCancel={() => setEditing(false)}
          onSaved={(u) => {
            setProfile({ ...profile, ...u });
            setEditing(false);
          }}
        />
      )}

      {profile.isMe ? (
        <CodeforcesLink
          handle={profile.cfHandle}
          verify={profile.cfVerify}
          onChange={(cfHandle, cfVerify) => setProfile({ ...profile, cfHandle, cfVerify })}
        />
      ) : (
        profile.cfHandle && (
          <p className="text-sm">
            Codeforces:{" "}
            <a
              href={`https://codeforces.com/profile/${profile.cfHandle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium hover:underline"
            >
              {profile.cfHandle} ↗
            </a>
          </p>
        )
      )}
      {profile.isMe && profile.hasPassword !== null && <ChangePassword hasPassword={profile.hasPassword} />}
      {!profile.isMe && viewer?.role === "ADMIN" && <AdminResetPassword username={profile.username} />}

      <dl className="grid grid-cols-3 gap-4 text-center">
        <Stat label="Problems solved" value={profile.stats.solved} />
        <Stat label="Submissions" value={profile.stats.submissions} />
        <Stat label="Accepted" value={profile.stats.accepted} />
      </dl>

      {profile.rating !== null && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <h2 className="font-semibold">Rating</h2>
            <span className={`text-2xl font-semibold ${ratingTextClass(profile.rating)}`}>{profile.rating}</span>
            <span className={ratingTextClass(profile.rating)}>{ratingTier(profile.rating).title}</span>
            {profile.maxRating !== null && (
              <span className="text-sm text-zinc-500">
                max <span className={ratingTextClass(profile.maxRating)}>{profile.maxRating}</span>
              </span>
            )}
          </div>
          <RatingChart history={profile.ratingHistory} />
          <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
            <table className="w-full text-left text-sm">
              <thead className="bg-black/[.03] text-zinc-500 dark:bg-white/[.04]">
                <tr>
                  <th className="px-3 py-2 font-medium">Contest</th>
                  <th className="px-3 py-2 text-right font-medium">Rank</th>
                  <th className="px-3 py-2 text-right font-medium">Change</th>
                  <th className="px-3 py-2 text-right font-medium">New rating</th>
                </tr>
              </thead>
              <tbody>
                {[...profile.ratingHistory].reverse().map((h) => (
                  <tr key={h.contest.slug} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-3 py-2">
                      <Link href={`/contests/${h.contest.slug}/standings`} className="hover:underline">
                        {h.contest.title}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right">{h.rank}</td>
                    <td className="px-3 py-2 text-right">
                      <RatingDelta from={h.oldRating} to={h.newRating} />
                    </td>
                    <td className={`px-3 py-2 text-right ${ratingTextClass(h.newRating)}`}>{h.newRating}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <Heatmap activity={profile.activity} />

      {profile.solvedProblems.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Solved problems</h2>
          <div className="flex flex-wrap gap-2">
            {profile.solvedProblems.map((p) => (
              <Link
                key={p.slug}
                href={`/problems/${p.slug}`}
                className="rounded-md bg-green-600/10 px-2 py-1 text-sm text-green-800 hover:underline dark:text-green-300"
              >
                {p.title}
              </Link>
            ))}
          </div>
        </section>
      )}

      {profile.teams.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">Teams</h2>
          <div className="flex flex-wrap gap-2">
            {profile.teams.map((t) => (
              <Link
                key={t.slug}
                href={`/teams/${t.slug}`}
                className="rounded-md bg-violet-500/10 px-2 py-1 text-sm text-violet-800 hover:underline dark:text-violet-300"
              >
                {t.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      <ContestList title="Contests authored" contests={profile.authoredContests} empty="" />
      <ContestList title="Contests participated" contests={profile.participatedContests} empty="Hasn't joined a contest yet." />

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Recent submissions</h2>
        <SubmissionTable query={`user=${encodeURIComponent(profile.username)}&limit=20`} showUser={false} />
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-black/10 py-3 dark:border-white/15">
      <dd className="text-2xl font-semibold">{value}</dd>
      <dt className="text-xs text-zinc-500">{label}</dt>
    </div>
  );
}

function ContestList({ title, contests, empty }: { title: string; contests: ContestSummary[]; empty: string }) {
  if (contests.length === 0 && !empty) return null;
  return (
    <section>
      <h2 className="mb-2 font-semibold">
        {title} ({contests.length})
      </h2>
      {contests.length === 0 ? (
        <p className="text-sm text-zinc-500">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {contests.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 text-sm">
              <Link href={`/contests/${c.slug}`} className="font-medium text-sky-700 hover:underline dark:text-sky-400">
                {c.title}
              </Link>
              <PhaseBadge phase={contestPhase(c.startsAt, c.endsAt)} />
              <span className="text-zinc-500">{formatDateTime(c.startsAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EditProfile({
  profile,
  onCancel,
  onSaved,
}: {
  profile: UserProfile;
  onCancel: () => void;
  onSaved: (u: AuthUser & Pick<UserProfile, "institution" | "batch" | "section">) => void;
}) {
  const { refresh } = useAuth();
  const [form, setForm] = useState<Required<ProfileUpdate>>({
    displayName: profile.displayName ?? "",
    institution: profile.institution ?? "",
    batch: profile.batch ?? "",
    section: profile.section ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof ProfileUpdate) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user } = await api<{ user: AuthUser }>("/users/me", { method: "PATCH", body: form });
      await refresh();
      onSaved({ ...user, institution: form.institution || null, batch: form.batch || null, section: form.section || null });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="grid gap-4 rounded-lg border border-black/10 p-4 sm:grid-cols-2 dark:border-white/15">
      <Field label="Full name">
        <input className={inputClass} value={form.displayName} onChange={set("displayName")} maxLength={60} />
      </Field>
      <Field label="Institution">
        <input className={inputClass} value={form.institution} onChange={set("institution")} maxLength={100} placeholder="Daffodil International University" />
      </Field>
      <Field label="Batch">
        <input className={inputClass} value={form.batch} onChange={set("batch")} maxLength={30} placeholder="61" />
      </Field>
      <Field label="Section" hint="Teachers can filter standings by section">
        <input className={inputClass} value={form.section} onChange={set("section")} maxLength={30} placeholder="61_A" />
      </Field>
      <div className="flex items-center gap-2 sm:col-span-2">
        <button type="submit" className={buttonClass} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" className={secondaryButtonClass} onClick={onCancel}>
          Cancel
        </button>
        <ErrorText>{error}</ErrorText>
      </div>
    </form>
  );
}
