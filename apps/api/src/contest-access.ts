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
  const registered =
    viewer !== null &&
    (await prisma!.contestParticipant.count({ where: { contestId: contest.id, userId: viewer.id } })) > 0;

  const canSeeProblems =
    canManage || (phase === "RUNNING" && registered) || (phase === "ENDED" && (contest.isPublic || registered));
  return { phase, canManage, registered, canSeeProblems };
}
