"use client";

// প্রবলেম পেজের অংশ — archive আর কনটেস্ট দুই জায়গাতেই ব্যবহার হয়।

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LANGUAGE_INFO,
  LANGUAGES,
  MAX_SOURCE_BYTES,
  timeLimitFor,
  type Language,
  type ProblemView,
} from "@vibejudge/shared";
import { useAuth } from "@/lib/auth";
import { Markdown } from "./markdown";
import { CodeEditor } from "./code-editor";
import { buttonClass } from "./ui";

const seconds = (ms: number) => `${ms / 1000} s`;

/** ধীর ভাষার বাড়তি সময়: "Java 2 s, Python 3 s" (শুধু যে ভাষাগুলো চলে) */
function slowerLanguageLimits(baseMs: number, languages: readonly Language[]): string {
  return languages
    .filter((l) => LANGUAGE_INFO[l].timeFactor !== 1)
    .map((l) => `${LANGUAGE_INFO[l].short} ${seconds(timeLimitFor(baseMs, l))}`)
    .join(", ");
}

/** শিরোনাম, লিমিট, স্টেটমেন্ট আর উদাহরণ */
export function ProblemBody({
  problem,
  titlePrefix,
  languages = LANGUAGES,
}: {
  problem: ProblemView;
  titlePrefix?: string;
  /** যে ভাষাগুলোতে সাবমিট করা যায় (ধীর ভাষার time limit দেখাতে) */
  languages?: readonly Language[];
}) {
  const slower = slowerLanguageLimits(problem.timeLimitMs, languages);
  if (problem.remote) {
    return (
      <header>
        <h1 className="text-3xl font-semibold">
          {titlePrefix && <span className="mr-2 text-zinc-500">{titlePrefix}.</span>}
          {problem.title}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">Codeforces {problem.remote.ref}</p>
      </header>
    );
  }
  return (
    <>
      <header>
        <h1 className="text-3xl font-semibold">
          {titlePrefix && <span className="mr-2 text-zinc-500">{titlePrefix}.</span>}
          {problem.title}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Time limit: {seconds(problem.timeLimitMs)}
          {slower && ` (${slower})`} · Memory limit: {problem.memoryLimitKb / 1024} MB
        </p>
      </header>

      <Markdown>{problem.statement}</Markdown>

      {problem.samples.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Examples</h2>
          {problem.samples.map((s, i) => (
            <div key={i} className="grid gap-3 sm:grid-cols-2">
              <Sample label={`Input ${i + 1}`} text={s.input} />
              <Sample label={`Output ${i + 1}`} text={s.answer} />
            </div>
          ))}
        </section>
      )}
    </>
  );
}

function Sample({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-lg border border-black/10 dark:border-white/15">
      <div className="border-b border-black/10 px-3 py-1 text-xs font-medium text-zinc-500 dark:border-white/15">
        {label}
      </div>
      <pre className="overflow-x-auto px-3 py-2 font-mono text-sm">{text}</pre>
    </div>
  );
}

const LANGUAGE_HINTS: Partial<Record<Language, string>> = {
  java: "Java: any class name works — we run your public class (or the class with main). Don't use a package line.",
  python: "Python 3: read input with input() or sys.stdin. For deep recursion, call sys.setrecursionlimit().",
};

// লেখা কোড আর বেছে নেওয়া ভাষা এই ব্রাউজারে মনে রাখি (রিফ্রেশ করলে যেন হারিয়ে না যায়)
const draftKey = (id: string, lang: Language) => `vj:draft:${id}:${lang}`;
const LANG_KEY = "vj:lang";
function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStorage(key: string, value: string): void {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {}
}

/**
 * কোড লিখে সাবমিট করার ফর্ম।
 * `draftId` দিয়ে draft আলাদা থাকে (archive-এ slug, কনটেস্টে "contest/label")।
 * `onSubmit` সাবমিশনের id ফেরত দেয় — তারপর সেই পেজে যায়।
 */
export function SubmitForm({
  draftId,
  loginNext,
  onSubmit,
  note,
  languages = LANGUAGES,
}: {
  draftId: string;
  loginNext: string;
  onSubmit: (language: Language, source: string) => Promise<string>;
  note?: React.ReactNode;
  /** কনটেস্টে author-এর বাছাই করা ভাষা; ডিফল্ট সব */
  languages?: readonly Language[];
}) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [language, setLanguage] = useState<Language>("cpp");
  const [source, setSource] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tooLarge = new Blob([source]).size > MAX_SOURCE_BYTES;

  // প্রথমবার: আগের ভাষা আর সেই ভাষার draft ফিরিয়ে আনি (এখানে না চললে C++ বা প্রথম চলা ভাষা)
  const allowedKey = languages.join(",");
  useEffect(() => {
    const allowed = allowedKey.split(",") as Language[];
    const saved = readStorage(LANG_KEY) as Language | null;
    const lang = saved && allowed.includes(saved) ? saved : allowed.includes("cpp") ? "cpp" : allowed[0]!;
    setLanguage(lang);
    setSource(readStorage(draftKey(draftId, lang)) ?? "");
  }, [draftId, allowedKey]);

  function changeLanguage(lang: Language) {
    setLanguage(lang);
    writeStorage(LANG_KEY, lang);
    setSource(readStorage(draftKey(draftId, lang)) ?? "");
  }

  function changeSource(value: string) {
    setSource(value);
    writeStorage(draftKey(draftId, language), value);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const id = await onSubmit(language, source);
      router.push(`/submissions/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  if (!authLoading && !user) {
    return (
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Submit</h2>
        <p className="text-zinc-600 dark:text-zinc-400">
          <Link href={`/login?next=${encodeURIComponent(loginNext)}`} className="text-sky-700 hover:underline dark:text-sky-400">
            Log in
          </Link>{" "}
          to submit a solution.
        </p>
      </section>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Submit</h2>
        <select
          value={language}
          onChange={(e) => changeLanguage(e.target.value as Language)}
          className="rounded-md border border-black/15 bg-transparent px-2 py-1 text-sm dark:border-white/20"
        >
          {languages.map((l) => (
            <option key={l} value={l}>
              {LANGUAGE_INFO[l].name}
            </option>
          ))}
        </select>
      </div>
      {note}
      {LANGUAGE_HINTS[language] && <p className="text-sm text-zinc-500">{LANGUAGE_HINTS[language]}</p>}
      <CodeEditor value={source} onChange={changeSource} language={language} modelId={draftId} />
      {tooLarge && <p className="text-sm text-red-600">Code is larger than {MAX_SOURCE_BYTES / 1024} KB.</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={submitting || !source.trim() || tooLarge} className={`${buttonClass} self-start`}>
        {submitting ? "Submitting…" : "Submit"}
      </button>
    </form>
  );
}
