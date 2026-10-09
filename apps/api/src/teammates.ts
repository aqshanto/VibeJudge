// Team contest-এ সতীর্থরা একে অপরের সাবমিশন (কোড সহ) দেখে — ICPC-তে টিম একই কম্পিউটারে বসে।
// সাবমিশন পেজ ঘনঘন রিফ্রেশ হয়, তাই প্রতিবার DB-তে না খুঁজে ১ মিনিট মনে রাখি।

import { prisma } from "./db.js";

/** দর্শকের প্রতিটা team contest-এ তার টিমের সবাই (নিজে সহ) */
export interface TeammateScope {
  contestId: string;
  userIds: string[];
}

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: Promise<TeammateScope[]> }>();

export function teammatesOf(userId: string): Promise<TeammateScope[]> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = (async () => {
    const mine = await prisma!.contestParticipant.findMany({
      where: { userId, teamId: { not: null } },
      select: { contestId: true, teamId: true },
    });
    if (mine.length === 0) return [];
    const mates = await prisma!.contestParticipant.findMany({
      where: { OR: mine.map((m) => ({ contestId: m.contestId, teamId: m.teamId })) },
      select: { contestId: true, userId: true },
    });
    const byContest = new Map<string, string[]>();
    for (const m of mates) byContest.set(m.contestId, [...(byContest.get(m.contestId) ?? []), m.userId]);
    return [...byContest].map(([contestId, userIds]) => ({ contestId, userIds }));
  })().catch((err) => {
    cache.delete(userId);
    throw err;
  });
  if (cache.size > 20_000) cache.clear();
  cache.set(userId, { at: Date.now(), value });
  return value;
}

/** নতুন টিম-রেজিস্ট্রেশনের পরে */
export function forgetTeammates(userIds: string[]): void {
  for (const id of userIds) cache.delete(id);
}
