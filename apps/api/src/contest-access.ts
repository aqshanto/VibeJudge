// কনটেস্টে কে কী দেখতে/করতে পারবে — সব নিয়ম এক জায়গায়।
//
//            | Manager (author/admin) | রেজিস্টার করা         | বাকিরা
// শুরুর আগে  | সব                     | শুধু তথ্য              | শুধু তথ্য
// চলাকালীন   | সব                     | প্রবলেম + সাবমিট       | শুধু তথ্য (রেজিস্টার করতে পারে)
// শেষে       | সব                     | প্রবলেম + upsolve      | public হলে প্রবলেম + upsolve

import { contestPhase, type AuthUser, type ContestPhase } from "@vibejudge/shared";
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
      _count: { select: { participants: true } },
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

// রেজিস্ট্রেশন বাতিল হয় না, তাই "হ্যাঁ" অনেকক্ষণ মনে রাখা যায়; "না" অল্প সময় (রেজিস্টার করলেই বদলায়)
const registrationCache = new Map<string, { at: number; registered: boolean }>();
const REGISTERED_TTL_MS = 10 * 60_000;
const NOT_REGISTERED_TTL_MS = 5_000;

async function isRegistered(contestId: string, userId: string): Promise<boolean> {
  const key = `${contestId}:${userId}`;
  const hit = registrationCache.get(key);
  if (hit && Date.now() - hit.at < (hit.registered ? REGISTERED_TTL_MS : NOT_REGISTERED_TTL_MS)) {
    return hit.registered;
  }
  const registered = (await prisma!.contestParticipant.count({ where: { contestId, userId } })) > 0;
  if (registrationCache.size > 50_000) registrationCache.clear();
  registrationCache.set(key, { at: Date.now(), registered });
  return registered;
}

export function rememberRegistration(contestId: string, userId: string): void {
  registrationCache.set(`${contestId}:${userId}`, { at: Date.now(), registered: true });
}

export interface ContestAccess {
  phase: ContestPhase;
  canManage: boolean;
  registered: boolean;
  /** প্রবলেম দেখা আর সাবমিট (চলাকালীন বা upsolve) */
  canSeeProblems: boolean;
}

export async function contestAccess(
  contest: { id: string; startsAt: Date; durationMinutes: number; isPublic: boolean; authorId: string | null },
  viewer: AuthUser | null,
): Promise<ContestAccess> {
  const phase = contestPhase(contest.startsAt, contest.durationMinutes);
  const canManage = viewer !== null && (viewer.role === "ADMIN" || viewer.id === contest.authorId);
  const registered = viewer !== null && (await isRegistered(contest.id, viewer.id));

  const canSeeProblems =
    canManage || (phase === "RUNNING" && registered) || (phase === "ENDED" && (contest.isPublic || registered));
  return { phase, canManage, registered, canSeeProblems };
}
