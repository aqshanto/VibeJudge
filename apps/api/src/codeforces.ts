// Codeforces-এর প্রবলেম: ছাত্র নিজের Codeforces account-এ জমা দেয়, আমরা অফিশিয়াল API দিয়ে ফল পড়ি
// (কোনো bot account না — Codeforces-এর নিয়ম মেনে)।
//
// - cfApi(): Codeforces বলে প্রতি ২ সেকেন্ডে একটার বেশি request না — সব request এক লাইনে
// - findCodeforcesProblem(): "1850A" বা লিংক থেকে প্রবলেমের নাম (পুরো problemset ২.২ MB, ৬ ঘণ্টা মনে রাখি)
// - syncCodeforcesUser(): একজনের সাম্প্রতিক সাবমিশন এনে, যে কনটেস্টে সে আছে সেখানে বসানো
// - startCodeforcesTracker(): চলমান কনটেস্টের প্রতিযোগীদের পালা করে দেখা

import type { FastifyBaseLogger } from "fastify";
import { personalWindow, type FinalVerdict, type Language, type Verdict } from "@vibejudge/shared";
import { prisma } from "./db.js";

const CF_API = "https://codeforces.com/api";
/** Codeforces-এর সীমা: প্রতি ২ সেকেন্ডে একটা — একটু বাড়তি রাখি */
const MIN_GAP_MS = 2100;

export class CodeforcesError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let queue: Promise<unknown> = Promise.resolve();
let lastCall = 0;

/** Codeforces API — সব request এক লাইনে, মাঝে ≥২ সেকেন্ড */
export function cfApi<T>(method: string, params: Record<string, string | number>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastCall + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
    let res: Response;
    try {
      res = await fetch(`${CF_API}/${method}?${qs}`, { signal: AbortSignal.timeout(30_000) });
    } catch {
      throw new CodeforcesError("Codeforces is not responding — try again in a minute");
    }
    const body = (await res.json().catch(() => null)) as { status?: string; result?: T; comment?: string } | null;
    if (!body || body.status !== "OK") throw new CodeforcesError(body?.comment ?? `Codeforces error (HTTP ${res.status})`);
    return body.result as T;
  });
  queue = run.catch(() => {});
  return run;
}

// ---------- প্রবলেম ----------

export interface CfProblemRef {
  contestId: number;
  index: string;
}

/** "1850A", "1850 A", বা লিংক (contest/1850/problem/A, problemset/problem/1850/A) */
export function parseCodeforcesRef(input: string): CfProblemRef | null {
  const s = input.trim();
  const url = /(?:contest|problemset\/problem)\/(\d+)\/(?:problem\/)?([A-Za-z]\d?)\b/.exec(s);
  const short = /^(\d+)\s*([A-Za-z]\d?)$/.exec(s);
  const m = url ?? short;
  if (!m) return null;
  return { contestId: Number(m[1]), index: m[2]!.toUpperCase() };
}

export const codeforcesKey = (r: CfProblemRef) => `${r.contestId}${r.index}`;
export const codeforcesUrl = (r: CfProblemRef) => `https://codeforces.com/contest/${r.contestId}/problem/${r.index}`;

const PROBLEMSET_TTL_MS = 6 * 3600_000;
let problemset: { at: number; names: Map<string, string> } | null = null;

/** প্রবলেমের নাম; না পেলে null (gym-এর প্রবলেম problemset-এ থাকে না) */
export async function findCodeforcesProblem(ref: CfProblemRef): Promise<string | null> {
  const key = codeforcesKey(ref);
  const fresh = problemset && Date.now() - problemset.at < PROBLEMSET_TTL_MS;
  // নতুন প্রবলেম হতে পারে — ১০ মিনিটের বেশি পুরোনো হলে আবার আনি
  const stale = !problemset || (!problemset.names.has(key) && Date.now() - problemset.at > 10 * 60_000);
  if (!fresh || stale) {
    const result = await cfApi<{ problems: { contestId: number; index: string; name: string }[] }>("problemset.problems", {});
    problemset = { at: Date.now(), names: new Map(result.problems.map((p) => [`${p.contestId}${p.index}`, p.name])) };
  }
  return problemset!.names.get(key) ?? null;
}

// ---------- সাবমিশন ----------

interface CfSubmission {
  id: number;
  contestId?: number;
  creationTimeSeconds: number;
  problem: { contestId?: number; index: string };
  programmingLanguage: string;
  verdict?: string;
  timeConsumedMillis: number;
  memoryConsumedBytes: number;
}

/** Codeforces-এর verdict → আমাদের (judge চলছে = JUDGING; null = গোনার মতো না) */
export function mapCodeforcesVerdict(v: string | undefined): Verdict {
  switch (v) {
    case undefined:
    case "TESTING":
      return "JUDGING";
    case "OK":
      return "AC";
    case "TIME_LIMIT_EXCEEDED":
    case "IDLENESS_LIMIT_EXCEEDED":
      return "TLE";
    case "MEMORY_LIMIT_EXCEEDED":
      return "MLE";
    case "RUNTIME_ERROR":
    case "SECURITY_VIOLATED":
      return "RE";
    case "COMPILATION_ERROR":
      return "CE";
    // judge-এর সমস্যা বা বাদ পড়া — প্রতিযোগীর দোষ না, penalty-ও না
    case "FAILED":
    case "CRASHED":
    case "INPUT_PREPARATION_CRASHED":
    case "SKIPPED":
      return "IE" satisfies FinalVerdict;
    default:
      return "WA"; // WRONG_ANSWER, PRESENTATION_ERROR, CHALLENGED, PARTIAL, REJECTED …
  }
}

export function mapCodeforcesLanguage(name: string): Language {
  const s = name.toLowerCase();
  if (s.includes("python") || s.includes("pypy")) return "python";
  if (s.includes("java") && !s.includes("javascript")) return "java";
  if (s.includes("c++") || s.includes("g++") || s.includes("clang")) return "cpp";
  if (/\bgnu c\b|\bc1[178]\b|\bc\s*\(/.test(s)) return "c";
  return "cpp";
}

/**
 * একজনের সাম্প্রতিক Codeforces সাবমিশন এনে, যে কনটেস্টে সে আছে (আসল বা virtual) আর যাতে সেই
 * প্রবলেম আছে, সেখানে বসায়। কনটেস্ট শুরুর আগের সাবমিশন বাদ; নিজের সময়ের মধ্যে হলে standings-এ গোনা।
 * ফেরত: নতুন বা বদলানো সাবমিশনের সংখ্যা।
 */
export async function syncCodeforcesUser(userId: string, handle: string, count = 30): Promise<number> {
  const participations = await prisma!.contestParticipant.findMany({
    where: { userId, contest: { problems: { some: { problem: { source: "CODEFORCES" } } } } },
    select: {
      virtual: true,
      startedAt: true,
      contest: {
        select: {
          id: true,
          type: true,
          startsAt: true,
          endsAt: true,
          durationMinutes: true,
          problems: { where: { problem: { source: "CODEFORCES" } }, select: { problem: { select: { id: true, remoteId: true } } } },
        },
      },
    },
  });
  if (participations.length === 0) return 0;

  const subs = await cfApi<CfSubmission[]>("user.status", { handle, from: 1, count });
  let changed = 0;
  for (const s of subs) {
    if (!s.problem.contestId) continue;
    const key = `${s.problem.contestId}${s.problem.index}`;
    const at = new Date(s.creationTimeSeconds * 1000);
    // একই প্রবলেম দুই কনটেস্টে থাকলে: যেটার নিজের সময়ের মধ্যে পড়ে সেটা আগে
    const options = participations.flatMap((p) => {
      const problem = p.contest.problems.find((cp) => cp.problem.remoteId === key)?.problem;
      if (!problem || at < p.contest.startsAt) return [];
      const win = personalWindow(p.contest, p);
      const inContest = win !== null && at.getTime() >= win.start && at.getTime() < win.end;
      return [{ contestId: p.contest.id, problemId: problem.id, inContest }];
    });
    const target = options.find((o) => o.inContest) ?? options[0];
    if (!target) continue;

    const verdict = mapCodeforcesVerdict(s.verdict);
    const data = {
      verdict,
      timeMs: verdict === "JUDGING" ? null : s.timeConsumedMillis,
      memoryKb: verdict === "JUDGING" ? null : Math.round(s.memoryConsumedBytes / 1024),
      judgedAt: verdict === "JUDGING" ? null : new Date(),
      inContest: target.inContest,
    };
    const remoteId = `cf:${s.id}`;
    const existing = await prisma!.submission.findUnique({ where: { remoteId }, select: { verdict: true, inContest: true } });
    if (existing && existing.verdict === data.verdict && existing.inContest === data.inContest) continue;
    const url = `https://codeforces.com/contest/${s.problem.contestId}/submission/${s.id}`;
    await prisma!.submission.upsert({
      where: { remoteId },
      create: {
        remoteId,
        problemId: target.problemId,
        contestId: target.contestId,
        userId,
        language: mapCodeforcesLanguage(s.programmingLanguage),
        remoteLanguage: s.programmingLanguage,
        // কোড Codeforces-এর API দেয় না — লিংক রাখি
        source: `// Submitted on Codeforces as ${handle}\n// ${url}\n`,
        createdAt: at,
        ...data,
      },
      update: data,
    });
    changed++;
  }
  return changed;
}

// ---------- পালা করে দেখা ----------

const TICK_MS = 20_000;
/** একজনকে এর চেয়ে ঘনঘন দেখি না (প্রতিযোগী বেশি হলে পালা আরও দেরিতে আসে — প্রতি ২ সে. একজন) */
const MIN_RECHECK_MS = 60_000;
const lastChecked = new Map<string, number>();

/** "Check now" বোতামের পরে পালার মধ্যে আবার না দেখতে */
export function markChecked(userId: string): void {
  lastChecked.set(userId, Date.now());
}

export function startCodeforcesTracker(log: FastifyBaseLogger): void {
  let busy = false;
  const tick = async () => {
    if (busy || !prisma) return;
    busy = true;
    try {
      const now = Date.now();
      // চলমান কনটেস্ট (শেষের পর ২ ঘণ্টা — দেরিতে judge হওয়া সাবমিশনের জন্য) বা চলমান virtual
      const contests = await prisma.contest.findMany({
        where: {
          problems: { some: { problem: { source: "CODEFORCES" } } },
          OR: [
            { startsAt: { lte: new Date(now) }, endsAt: { gte: new Date(now - 2 * 3600_000) } },
            { participants: { some: { virtual: true, startedAt: { gte: new Date(now - 24 * 3600_000) } } } },
          ],
        },
        select: { id: true },
      });
      if (contests.length === 0) return;
      const people = await prisma.contestParticipant.findMany({
        where: { contestId: { in: contests.map((c) => c.id) }, user: { cfHandle: { not: null } } },
        distinct: ["userId"],
        select: { user: { select: { id: true, cfHandle: true } } },
      });
      // যাকে সবচেয়ে আগে দেখা হয়েছিল সে আগে
      people.sort((a, b) => (lastChecked.get(a.user.id) ?? 0) - (lastChecked.get(b.user.id) ?? 0));
      for (const { user } of people) {
        if (Date.now() - (lastChecked.get(user.id) ?? 0) < MIN_RECHECK_MS) continue;
        lastChecked.set(user.id, Date.now());
        try {
          await syncCodeforcesUser(user.id, user.cfHandle!);
        } catch (err) {
          log.warn({ err: (err as Error).message, handle: user.cfHandle }, "codeforces sync failed");
        }
        // পালা শেষ হওয়ার আগে নতুন কনটেস্ট/প্রতিযোগী এলে পরের tick-এ ধরা পড়বে
        if (Date.now() - now > 5 * 60_000) break;
      }
    } catch (err) {
      log.warn({ err: (err as Error).message }, "codeforces tracker failed");
    } finally {
      busy = false;
    }
  };
  setInterval(() => void tick(), TICK_MS).unref();
}
