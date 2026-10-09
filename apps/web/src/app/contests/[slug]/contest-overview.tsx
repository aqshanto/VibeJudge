"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ContestDetail, ContestPhase, PersonalState } from "@vibejudge/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatCountdown, formatDateTime, formatDuration } from "@/lib/time";
import { Markdown } from "@/components/markdown";
import { SubmissionTable } from "@/components/submission-table";
import { ErrorText, buttonClass, inputClass } from "@/components/ui";
import { ContestHeader } from "./contest-header";
import { useContest } from "./use-contest";

export function ContestOverview({ slug }: { slug: string }) {
  const { contest, error, phase, personal, window: mine, now, reload, setContest } = useContest(slug);
  const { user, loading } = useAuth();
  const loaded = contest !== null && !loading;

  // "#my-submissions" লিংকে এলে — ডেটা আসার আগে সেকশনটা থাকে না, তাই লোড হলে নিজে স্ক্রল করি
  useEffect(() => {
    if (loaded && window.location.hash === "#my-submissions") {
      document.getElementById("my-submissions")?.scrollIntoView();
    }
  }, [loaded]);

  if (error) return <p className="text-red-600">Could not load contest: {error}</p>;
  if (!contest || !phase) return <p className="text-zinc-500">Loading…</p>;

  const showProblems = contest.problems.length > 0;

  return (
    <div className="flex flex-col gap-8">
      <ContestHeader contest={contest} phase={phase} now={now} active="overview" />

      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
        {contest.type === "WINDOW" ? (
          <>
            <Info label="Window" value={`${formatDateTime(contest.startsAt)} – ${formatDateTime(contest.endsAt)}`} />
            <Info label="Your time" value={`${formatDuration(contest.durationMinutes)} from when you start`} />
          </>
        ) : (
          <>
            <Info label="Start" value={formatDateTime(contest.startsAt)} />
            <Info label="Length" value={formatDuration(contest.durationMinutes)} />
          </>
        )}
        <Info
          label="Scoring"
          value={contest.scoring === "ICPC" ? `ICPC · ${contest.penaltyMinutes} min penalty` : "IOI · partial points"}
        />
        <Info label="Participants" value={String(contest.participantCount)} />
      </dl>

      {phase !== "ENDED" && !contest.viewer.registered && !contest.viewer.canManage && (
        <RegisterBox contest={contest} loggedIn={user !== null} onRegistered={reload} />
      )}
      {contest.viewer.registered && phase === "UPCOMING" && (
        <p className="rounded-md bg-green-600/10 px-3 py-2 text-sm text-green-800 dark:text-green-300">
          {contest.type === "WINDOW"
            ? "✓ You are registered. When the window opens, a Start button appears here — your time begins when you press it."
            : "✓ You are registered. Problems appear here when the contest starts — this page updates by itself."}
        </p>
      )}
      <ParticipationBox
        contest={contest}
        phase={phase}
        personal={personal}
        myEnd={mine?.end ?? null}
        now={now}
        loggedIn={user !== null}
        onChange={setContest}
      />

      {showProblems && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Problems</h2>
          <div className="overflow-hidden rounded-lg border border-black/10 dark:border-white/15">
            <table className="w-full text-left text-sm">
              <tbody>
                {contest.problems.map((p) => (
                  <tr key={p.label} className="border-b border-black/10 last:border-0 dark:border-white/10">
                    <td className="w-12 px-4 py-2.5 font-semibold">{p.label}</td>
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/contests/${contest.slug}/problems/${p.label}`}
                        className="font-medium text-sky-700 hover:underline dark:text-sky-400"
                      >
                        {p.title}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {contest.description && (
        <section>
          <Markdown>{contest.description}</Markdown>
        </section>
      )}

      {user && (contest.viewer.registered || contest.viewer.canManage || phase === "ENDED") && (
        <section id="my-submissions" className="flex scroll-mt-6 flex-col gap-3">
          <h2 className="text-lg font-semibold">My submissions</h2>
          <SubmissionTable
            query={`mine=true&contest=${encodeURIComponent(contest.slug)}&limit=50`}
            showUser={false}
            emptyText="No submissions yet."
          />
        </section>
      )}
    </div>
  );
}

/** WINDOW-এর Start বোতাম, virtual participation, আর নিজের ঘড়ির অবস্থা */
function ParticipationBox({
  contest,
  phase,
  personal,
  myEnd,
  now,
  loggedIn,
  onChange,
}: {
  contest: ContestDetail;
  phase: ContestPhase;
  personal: PersonalState | null;
  myEnd: number | null;
  now: number;
  loggedIn: boolean;
  onChange: (c: ContestDetail) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const p = contest.viewer.participation;
  const fullMs = contest.durationMinutes * 60_000;
  const windowLeft = new Date(contest.endsAt).getTime() - now;

  async function post(path: "start" | "virtual", confirmText: string) {
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await api<ContestDetail>(`/contests/${contest.slug}/${path}`, { method: "POST" }));
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  }

  const note = (text: React.ReactNode, tone: "info" | "done" = "info") => (
    <p
      className={`rounded-md px-3 py-2 text-sm ${
        tone === "done" ? "bg-black/[.04] text-zinc-600 dark:bg-white/[.06] dark:text-zinc-300" : "bg-sky-500/10 text-sky-900 dark:text-sky-200"
      }`}
    >
      {text}
    </p>
  );

  // ---- WINDOW: রেজিস্টার করা, জানালা খোলা ----
  if (contest.type === "WINDOW" && p && !p.virtual && phase === "RUNNING") {
    if (personal === "NOT_STARTED") {
      const shortened = windowLeft < fullMs;
      const youGet = formatDuration(Math.floor(Math.min(fullMs, windowLeft) / 60_000));
      return (
        <div className="flex flex-col gap-3 rounded-lg border border-sky-500/40 bg-sky-500/5 p-4">
          <p className="text-sm">
            Your time starts when you press <b>Start</b>. You get <b>{youGet}</b>
            {shortened && <span className="text-amber-700 dark:text-amber-300"> — less than the full {formatDuration(contest.durationMinutes)}, because the window closes soon</span>}
            . You can&apos;t pause it.
          </p>
          <button
            type="button"
            disabled={busy}
            className={`${buttonClass} self-start`}
            onClick={() => post("start", `Start now? You get ${youGet} and the timer can't be paused.`)}
          >
            {busy ? "Starting…" : "Start"}
          </button>
          <ErrorText>{error}</ErrorText>
        </div>
      );
    }
    if (personal === "FINISHED") {
      return note(
        <>Your time is over. Standings and practice open when the window closes ({formatDateTime(contest.endsAt)}).</>,
        "done",
      );
    }
    return null;
  }

  // ---- কনটেস্ট শেষ: virtual ----
  if (phase !== "ENDED" || contest.viewer.canManage) return null;
  if (p?.virtual) {
    if (personal === "RUNNING" && myEnd) {
      return note(
        <>
          <b>Virtual participation</b> — {formatCountdown(myEnd - now)} left. The standings show the real participants as
          they were at the same point of their contest.
        </>,
      );
    }
    return note("You finished your virtual participation. Your row in the standings is marked “virtual”.", "done");
  }
  if (!p && contest.isPublic && loggedIn) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-black/10 p-4 text-sm dark:border-white/15">
        <p className="flex-1">
          Missed it? Take this contest <b>virtually</b>: {formatDuration(contest.durationMinutes)} on your own clock, ranked
          against the real participants. It doesn&apos;t change their standings.
        </p>
        <button
          type="button"
          disabled={busy}
          className={buttonClass}
          onClick={() =>
            post("virtual", `Start a virtual contest now? You get ${formatDuration(contest.durationMinutes)} and can do it only once.`)
          }
        >
          {busy ? "Starting…" : "Start virtual participation"}
        </button>
        <ErrorText>{error}</ErrorText>
      </div>
    );
  }
  return null;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-zinc-500">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function RegisterBox({
  contest,
  loggedIn,
  onRegistered,
}: {
  contest: ContestDetail;
  loggedIn: boolean;
  onRegistered: () => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!loggedIn) {
    return (
      <p className="rounded-md border border-black/10 px-4 py-3 text-sm dark:border-white/15">
        <Link href={`/login?next=/contests/${contest.slug}`} className="text-sky-700 hover:underline dark:text-sky-400">
          Log in
        </Link>{" "}
        to register for this contest.
      </p>
    );
  }

  async function register(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/contests/${contest.slug}/register`, { method: "POST", body: { password } });
      await onRegistered();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={register} className="flex flex-wrap items-end gap-3 rounded-lg border border-black/10 p-4 dark:border-white/15">
      {contest.hasPassword && (
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Contest password</span>
          <input className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="off" />
        </label>
      )}
      <button type="submit" disabled={busy} className={buttonClass}>
        {busy ? "Registering…" : "Register"}
      </button>
      <ErrorText>{error}</ErrorText>
    </form>
  );
}
