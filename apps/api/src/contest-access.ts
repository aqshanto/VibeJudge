// কনটেস্টে কে কী দেখতে/করতে পারবে — সব নিয়ম এক জায়গায়।
//
//            | Manager (author/admin) | রেজিস্টার করা         | বাকিরা
// শুরুর আগে  | সব                     | শুধু তথ্য              | শুধু তথ্য
// চলাকালীন   | সব                     | প্রবলেম + সাবমিট       | শুধু তথ্য (রেজিস্টার করতে পারে)
// শেষে       | সব                     | প্রবলেম + upsolve      | public হলে প্রবলেম + upsolve (বা virtual)
//
// "চলাকালীন" মানে প্রতিযোগীর নিজের ঘড়িতে: FIXED-এ সবার একই, WINDOW-এ Start চাপা থেকে,
// virtual-এ কনটেস্ট শেষ হওয়ার পরে নিজের Start থেকে।

import {
  contestPhase,
  personalState,
  personalWindow,
  type AuthUser,
  type ContestPhase,
  type PersonalState,
} from "@vibejudge/shared";
import { prisma } from "./db.js";

export async function loadContest(slug: string) {
  return prisma!.contest.findUnique({
    where: { slug },
    include: {
      problems: {
        orderBy: { label: "asc" },
        include: { problem: { select: { id: true, slug: true, title: true } } },
      },
      author: { select: { username: true } },
      _count: { select: { participants: { where: { virtual: false } } } },
    },
  });
}

export type LoadedContest = NonNullable<Awaited<ReturnType<typeof loadContest>>>;

// ---------- ছোট memory cache ----------
// কনটেস্টের সময় ১০০০ জন প্রতি ৩০ সেকেন্ডে standings/প্রবলেম চায়। প্রতিবার DB-তে কনটেস্ট আর
// রেজিস্ট্রেশন খুঁজলে DB connection pool (১০টা) লাইনে আটকে যায় — তাই কয়েক সেকেন্ড মনে রাখি।

const CONTEST_TTL_MS = 5_000;
const contestCache = new Map<string, { at: number; value: Promise<LoadedContest | null> }>();

/** কনটেস্ট পড়ার জন্য (৫ সেকেন্ড পুরোনো হতে পারে); এডিটের পরে invalidateContest() ডাকতে হবে */
export function loadContestCached(slug: string): Promise<LoadedContest | null> {
  const hit = contestCache.get(slug);
  if (hit && Date.now() - hit.at < CONTEST_TTL_MS) return hit.value;
  const value = loadContest(slug).catch((err) => {
    contestCache.delete(slug);
    throw err;
  });
  if (contestCache.size > 1000) contestCache.clear();
  contestCache.set(slug, { at: Date.now(), value });
  return value;
}

export function invalidateContest(...slugs: string[]): void {
  for (const s of slugs) contestCache.delete(s);
}

// রেজিস্ট্রেশন বাতিল হয় না, তাই থাকলে অনেকক্ষণ মনে রাখা যায়; না থাকলে অল্প সময় (রেজিস্টার করলেই বদলায়)।
// Start চাপলে startedAt বদলায় — তখন rememberParticipation() দিয়ে cache-ও বদলাই।
export interface ParticipationRow {
  virtual: boolean;
  startedAt: Date | null;
}
const participationCache = new Map<string, { at: number; row: ParticipationRow | null }>();
const FOUND_TTL_MS = 10 * 60_000;
const NOT_FOUND_TTL_MS = 5_000;

async function participation(contestId: string, userId: string): Promise<ParticipationRow | null> {
  const key = `${contestId}:${userId}`;
  const hit = participationCache.get(key);
  if (hit && Date.now() - hit.at < (hit.row ? FOUND_TTL_MS : NOT_FOUND_TTL_MS)) return hit.row;
  const row = await prisma!.contestParticipant.findUnique({
    where: { contestId_userId: { contestId, userId } },
    select: { virtual: true, startedAt: true },
  });
  if (participationCache.size > 50_000) participationCache.clear();
  participationCache.set(key, { at: Date.now(), row });
  return row;
}

export function rememberParticipation(contestId: string, userId: string, row: ParticipationRow): void {
  participationCache.set(`${contestId}:${userId}`, { at: Date.now(), row });
}

export interface ContestAccess {
  /** পুরো কনটেস্টের phase (WINDOW-এ: জানালা) */
  phase: ContestPhase;
  canManage: boolean;
  /** আসল রেজিস্ট্রেশন (virtual না) */
  registered: boolean;
  participation: ParticipationRow | null;
  /** দর্শকের নিজের শুরু-শেষ (ms) */
  window: { start: number; end: number } | null;
  /** দর্শকের নিজের ঘড়ি; প্রতিযোগী না হলে null */
  personal: PersonalState | null;
  /** প্রবলেম দেখা আর সাবমিট (চলাকালীন বা upsolve) */
  canSeeProblems: boolean;
  /** এখনকার সাবমিশন standings-এ গোনা হবে */
  countsForStandings: boolean;
}

type AccessContest = {
  id: string;
  type: "FIXED" | "WINDOW";
  startsAt: Date;
  endsAt: Date;
  durationMinutes: number;
  isPublic: boolean;
  authorId: string | null;
};

export async function contestAccess(contest: AccessContest, viewer: AuthUser | null): Promise<ContestAccess> {
  const now = Date.now();
  const phase = contestPhase(contest.startsAt, contest.endsAt, now);
  const canManage = viewer !== null && (viewer.role === "ADMIN" || viewer.id === contest.authorId);
  const part = viewer ? await participation(contest.id, viewer.id) : null;
  const registered = part !== null && !part.virtual;
  const window = part ? personalWindow(contest, part) : null;
  const personal = part ? personalState(window, now) : null;
  const running = personal === "RUNNING";

  const canSeeProblems =
    canManage ||
    running ||
    // শেষে upsolve; WINDOW-এ জানালা বন্ধের আগে না (অন্যরা এখনো দিচ্ছে)
    (phase === "ENDED" && (contest.isPublic || registered));
  // FIXED-এ চলাকালীন রেজিস্টার করলেও গোনা হয় (আগের নিয়ম); virtual-ও নিজের standings-এ গোনা হয়
  const countsForStandings = running;
  return { phase, canManage, registered, participation: part, window, personal, canSeeProblems, countsForStandings };
}
