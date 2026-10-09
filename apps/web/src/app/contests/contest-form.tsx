"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CONTEST_LIMITS,
  DEFAULT_CONTEST_LANGUAGES,
  LANGUAGE_INFO,
  LANGUAGES,
  SLUG_PATTERN,
  TEAM_LIMITS,
  problemLabel,
  type AuthorProblemSummary,
  type ContestInput,
  type ContestType,
  type Language,
  type ScoringType,
} from "@vibejudge/shared";
import { api } from "@/lib/api";
import { toLocalInput } from "@/lib/time";
import { ErrorText, Field, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";

interface Candidate {
  slug: string;
  title: string;
  note: string;
}

interface EditData extends Omit<ContestInput, "password"> {
  hasPassword: boolean;
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

/** `slug` না দিলে নতুন কনটেস্ট, দিলে এডিট */
export function ContestForm({ slug: editSlug }: { slug?: string }) {
  const router = useRouter();
  const [loaded, setLoaded] = useState(!editSlug);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(Boolean(editSlug));
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState(() => toLocalInput(new Date(Date.now() + 86400_000).toISOString()));
  const [hours, setHours] = useState("2");
  const [minutes, setMinutes] = useState("0");
  const [scoring, setScoring] = useState<ScoringType>("ICPC");
  const [type, setType] = useState<ContestType>("FIXED");
  // WINDOW: জানালা কতক্ষণ খোলা (প্রত্যেকে পায় hours/minutes)
  const [winHours, setWinHours] = useState("6");
  const [winMinutes, setWinMinutes] = useState("0");
  const [teamContest, setTeamContest] = useState(false);
  const [teamSize, setTeamSize] = useState("3");
  const [penalty, setPenalty] = useState("20");
  const [freeze, setFreeze] = useState("0");
  const [isPublic, setIsPublic] = useState(true);
  const [languages, setLanguages] = useState<Language[]>(DEFAULT_CONTEST_LANGUAGES);
  const [hadPassword, setHadPassword] = useState(false);
  const [changePassword, setChangePassword] = useState(!editSlug);
  const [password, setPassword] = useState("");
  const [problems, setProblems] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [pick, setPick] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // যোগ করা যায় এমন প্রবলেম: নিজের (admin হলে সবার) + archive-এর public
  useEffect(() => {
    Promise.all([
      api<{ problems: AuthorProblemSummary[] }>("/author/problems"),
      api<{ slug: string; title: string }[]>("/problems"),
    ]).then(([mine, pub]) => {
      const map = new Map<string, Candidate>();
      for (const p of mine.problems) {
        map.set(p.slug, { slug: p.slug, title: p.title, note: `${p.visibility.toLowerCase()}, ${p.testCount} tests` });
      }
      for (const p of pub) if (!map.has(p.slug)) map.set(p.slug, { slug: p.slug, title: p.title, note: "public" });
      setCandidates([...map.values()]);
    }, (e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!editSlug) return;
    api<EditData>(`/contests/${encodeURIComponent(editSlug)}/edit`).then((c) => {
      setTitle(c.title);
      setSlug(c.slug);
      setDescription(c.description);
      setStartsAt(toLocalInput(c.startsAt));
      setHours(String(Math.floor(c.durationMinutes / 60)));
      setMinutes(String(c.durationMinutes % 60));
      setScoring(c.scoring);
      setType(c.type ?? "FIXED");
      setTeamContest(c.teamSize != null);
      if (c.teamSize != null) setTeamSize(String(c.teamSize));
      if (c.type === "WINDOW" && c.windowMinutes) {
        setWinHours(String(Math.floor(c.windowMinutes / 60)));
        setWinMinutes(String(c.windowMinutes % 60));
      }
      setPenalty(String(c.penaltyMinutes));
      setFreeze(String(c.freezeMinutes));
      setIsPublic(c.isPublic);
      if (c.languages) setLanguages(c.languages);
      setHadPassword(c.hasPassword);
      setProblems(c.problemSlugs);
      setLoaded(true);
    }, (e: Error) => setError(e.message));
  }, [editSlug]);

  const bySlug = new Map(candidates.map((c) => [c.slug, c]));
  const available = candidates.filter((c) => !problems.includes(c.slug));

  function move(i: number, delta: number) {
    setProblems((ps) => {
      const next = [...ps];
      const [item] = next.splice(i, 1);
      next.splice(i + delta, 0, item!);
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (problems.length === 0) return setError("Add at least one problem");
    if (languages.length === 0) return setError("Allow at least one language");
    const durationMinutes = Number(hours) * 60 + Number(minutes);
    const body: ContestInput = {
      slug,
      title,
      description,
      startsAt: new Date(startsAt).toISOString(),
      durationMinutes,
      scoring,
      type,
      ...(type === "WINDOW" ? { windowMinutes: Number(winHours) * 60 + Number(winMinutes) } : {}),
      teamSize: teamContest ? Number(teamSize) : null,
      penaltyMinutes: Number(penalty),
      freezeMinutes: Number(freeze),
      isPublic,
      languages,
      problemSlugs: problems,
      ...(changePassword ? { password } : {}),
    };
    setBusy(true);
    try {
      const res = editSlug
        ? await api<{ slug: string }>(`/contests/${encodeURIComponent(editSlug)}`, { method: "PUT", body })
        : await api<{ slug: string }>("/contests", { method: "POST", body });
      router.push(`/contests/${res.slug}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (!loaded) return error ? <ErrorText>{error}</ErrorText> : <p className="text-zinc-500">Loading…</p>;

  return (
    <form onSubmit={submit} className="flex max-w-2xl flex-col gap-5">
      <Field label="Title">
        <input
          className={inputClass}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (!slugEdited) setSlug(slugify(e.target.value));
          }}
          maxLength={120}
          required
        />
      </Field>
      <Field label="Short name (URL)" hint={`/contests/${slug || "…"}`}>
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

      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="mb-1.5 font-medium">Timing</legend>
        <label className="flex items-start gap-2">
          <input type="radio" checked={type === "FIXED"} onChange={() => setType("FIXED")} className="mt-1" />
          <span>
            <b>Fixed time</b> <span className="text-zinc-500">— everyone starts and ends together.</span>
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input type="radio" checked={type === "WINDOW"} onChange={() => setType("WINDOW")} className="mt-1" />
          <span>
            <b>Window</b>{" "}
            <span className="text-zinc-500">
              — each participant presses Start any time inside the window and gets the same length (e.g. sections taking a lab
              exam at different hours). Standings stay hidden until the window closes.
            </span>
          </span>
        </label>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={type === "WINDOW" ? "Window opens (your local time)" : "Start (your local time)"}>
          <input className={inputClass} type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
        </Field>
        <Field label={type === "WINDOW" ? "Each participant gets (hours)" : "Length (hours)"}>
          <input className={inputClass} type="number" min={0} value={hours} onChange={(e) => setHours(e.target.value)} required />
        </Field>
        <Field label="+ minutes">
          <input className={inputClass} type="number" min={0} max={59} value={minutes} onChange={(e) => setMinutes(e.target.value)} required />
        </Field>
      </div>
      {type === "WINDOW" && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Window stays open (hours)"
            hint="Someone who starts late gets only the time left until the window closes."
          >
            <input className={inputClass} type="number" min={0} value={winHours} onChange={(e) => setWinHours(e.target.value)} required />
          </Field>
          <Field label="+ minutes">
            <input className={inputClass} type="number" min={0} max={59} value={winMinutes} onChange={(e) => setWinMinutes(e.target.value)} required />
          </Field>
        </div>
      )}

      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="mb-1.5 font-medium">Scoring</legend>
        <label className="flex items-start gap-2">
          <input type="radio" checked={scoring === "ICPC"} onChange={() => setScoring("ICPC")} className="mt-1" />
          <span>
            <b>ICPC</b> <span className="text-zinc-500">— rank by problems solved, then penalty time. A wrong answer costs penalty minutes (compile errors don&apos;t).</span>
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input type="radio" checked={scoring === "IOI"} onChange={() => setScoring("IOI")} className="mt-1" />
          <span>
            <b>IOI</b> <span className="text-zinc-500">— partial marks: each problem gives up to 100 points by the share of tests passed. Best submission counts.</span>
          </span>
        </label>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        {scoring === "ICPC" && (
          <Field label="Penalty per wrong submission (minutes)">
            <input
              className={inputClass}
              type="number"
              min={CONTEST_LIMITS.penaltyMinutes.min}
              max={CONTEST_LIMITS.penaltyMinutes.max}
              value={penalty}
              onChange={(e) => setPenalty(e.target.value)}
              required
            />
          </Field>
        )}
        {type === "FIXED" && (
          <Field label="Freeze standings for the last … minutes" hint="0 = no freeze. Unfreezes when the contest ends.">
            <input className={inputClass} type="number" min={0} value={freeze} onChange={(e) => setFreeze(e.target.value)} required />
          </Field>
        )}
      </div>

      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="mb-1.5 font-medium">Languages</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {LANGUAGES.map((l) => (
            <label key={l} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={languages.includes(l)}
                onChange={(e) =>
                  setLanguages((ls) => LANGUAGES.filter((x) => (x === l ? e.target.checked : ls.includes(x))))
                }
              />
              {LANGUAGE_INFO[l].name}
              {LANGUAGE_INFO[l].timeFactor !== 1 && (
                <span className="text-zinc-500">· {LANGUAGE_INFO[l].timeFactor}× time</span>
              )}
            </label>
          ))}
        </div>
        <p className="text-zinc-500">After the contest ends, practice (upsolve) is open in every language.</p>
      </fieldset>

      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="mb-1.5 font-medium">Participants</legend>
        <label className="flex flex-wrap items-center gap-2">
          <input type="checkbox" checked={teamContest} onChange={(e) => setTeamContest(e.target.checked)} />
          Team contest
          {teamContest && (
            <>
              <span className="text-zinc-500">— at most</span>
              <select
                className="rounded-md border border-black/15 bg-transparent px-2 py-1 dark:border-white/20"
                value={teamSize}
                onChange={(e) => setTeamSize(e.target.value)}
              >
                {Array.from(
                  { length: TEAM_LIMITS.contestSize.max - TEAM_LIMITS.contestSize.min + 1 },
                  (_, i) => TEAM_LIMITS.contestSize.min + i,
                ).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <span className="text-zinc-500">members per team</span>
            </>
          )}
        </label>
        {teamContest && (
          <p className="text-zinc-500">
            Students make a team on their Teams page; any member registers the whole team. The standings show one row per
            team, and teammates can see each other&apos;s submissions. Can&apos;t be switched once someone has registered.
          </p>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="mb-1.5 font-medium">Who can join</legend>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
          Show in the public contest list
        </label>
        {editSlug && hadPassword && !changePassword ? (
          <p className="text-zinc-500">
            A join password is set.{" "}
            <button type="button" className="text-sky-700 underline dark:text-sky-400" onClick={() => setChangePassword(true)}>
              Change or remove it
            </button>
          </p>
        ) : (
          <Field label="Join password (optional)" hint="Leave empty for no password. Share it only with your students.">
            <input className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} maxLength={100} autoComplete="off" />
          </Field>
        )}
      </fieldset>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Problems</h2>
        {problems.length === 0 && <p className="text-sm text-zinc-500">No problems yet.</p>}
        <ol className="flex flex-col gap-1.5">
          {problems.map((p, i) => (
            <li key={p} className="flex items-center gap-2 rounded-md border border-black/10 px-3 py-1.5 text-sm dark:border-white/15">
              <span className="w-5 font-semibold">{problemLabel(i)}</span>
              <span className="flex-1">
                {bySlug.get(p)?.title ?? p} <span className="font-mono text-xs text-zinc-500">{p}</span>
              </span>
              <button type="button" className="px-1 text-zinc-500 disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                ↑
              </button>
              <button type="button" className="px-1 text-zinc-500 disabled:opacity-30" disabled={i === problems.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                ↓
              </button>
              <button type="button" className="px-1 text-red-600" onClick={() => setProblems((ps) => ps.filter((x) => x !== p))} aria-label="Remove">
                ✕
              </button>
            </li>
          ))}
        </ol>
        {problems.length < CONTEST_LIMITS.maxProblems && (
          <div className="flex gap-2">
            <select className={`${inputClass} flex-1`} value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Choose a problem to add…</option>
              {available.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.title} ({c.slug}) — {c.note}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={secondaryButtonClass}
              disabled={!pick}
              onClick={() => {
                setProblems((ps) => [...ps, pick]);
                setPick("");
              }}
            >
              Add
            </button>
          </div>
        )}
        <p className="text-xs text-zinc-500">
          Tip: set your own problems to <b>Contest</b> visibility so they stay hidden from the archive until you publish them.
        </p>
      </section>

      <Field label="Description (Markdown, optional)">
        <textarea className={`${inputClass} h-28`} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>

      <ErrorText>{error}</ErrorText>
      <button type="submit" disabled={busy} className={`${buttonClass} self-start`}>
        {busy ? "Saving…" : editSlug ? "Save contest" : "Create contest"}
      </button>
    </form>
  );
}
