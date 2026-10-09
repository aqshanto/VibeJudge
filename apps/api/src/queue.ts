// সাবমিশন কিউ — Postgres-এর `FOR UPDATE SKIP LOCKED` দিয়ে, আলাদা Redis লাগে না।
//
// Worker-রা long-poll করে: কাজ না থাকলে API DB-তে বারবার query না করে অপেক্ষা করে,
// নতুন সাবমিশন এলে notifyWork() সবাইকে জাগিয়ে দেয়। এতে idle অবস্থায় DB ঘুমাতে পারে
// (Neon-এর ফ্রি compute ঘণ্টা বাঁচে)।

import { randomBytes } from "node:crypto";
import type { JudgeJob, Language } from "@vibejudge/shared";
import { prisma } from "./db.js";

/** এর বেশি সময় JUDGING থাকলে ধরে নিই worker মরে গেছে — অন্য worker আবার নেবে */
export const CLAIM_TIMEOUT_MS = 10 * 60 * 1000;

// hint = "DB-তে হয়তো কাজ আছে"। শুরুতে true, যাতে restart-এর আগের PENDING কাজ ধরা পড়ে।
let hint = true;
// প্রতিটা notify-তে বাড়ে — query চলাকালীন নতুন কাজ এলে hint যেন ভুল করে false না হয়
let epoch = 0;
const waiters = new Set<() => void>();

export function notifyWork(): void {
  hint = true;
  epoch++;
  for (const wake of [...waiters]) wake();
}

function waitForWork(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      waiters.delete(done);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    waiters.add(done);
    signal.addEventListener("abort", done);
  });
}

export async function claimJob(workerName: string, waitMs: number, signal: AbortSignal): Promise<JudgeJob | null> {
  const deadline = Date.now() + waitMs;
  for (;;) {
    if (signal.aborted) return null;
    if (hint) {
      const seen = epoch;
      const job = await tryClaim(workerName);
      if (job) {
        // timeout পার হলে আবার খুঁজতে হবে (যদি এই worker রেজাল্ট না পাঠায়)
        setTimeout(notifyWork, CLAIM_TIMEOUT_MS + 1000).unref();
        return job;
      }
      if (epoch === seen) hint = false;
    }
    const left = deadline - Date.now();
    if (left <= 0) return null;
    await waitForWork(left, signal);
  }
}

async function tryClaim(workerName: string): Promise<JudgeJob | null> {
  if (!prisma) throw new Error("Database is not configured");
  const claimToken = randomBytes(18).toString("base64url");
  const timeoutSec = CLAIM_TIMEOUT_MS / 1000;

  const rows = await prisma.$queryRaw<
    { id: string; language: Language; source: string; problemId: string; contestId: string | null }[]
  >`
    UPDATE "submissions"
    SET "verdict" = 'JUDGING', "workerName" = ${workerName}, "claimToken" = ${claimToken}, "claimedAt" = now()
    WHERE "id" = (
      SELECT "id" FROM "submissions"
      WHERE "verdict" = 'PENDING'
         OR ("verdict" = 'JUDGING' AND "claimedAt" < now() - make_interval(secs => ${timeoutSec}))
      ORDER BY "createdAt"
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id", "language"::text AS "language", "source", "problemId", "contestId"`;

  const row = rows[0];
  if (!row) return null;

  const contest = row.contestId
    ? await prisma.contest.findUnique({ where: { id: row.contestId }, select: { scoring: true } })
    : null;
  const problem = await prisma.problem.findUniqueOrThrow({
    where: { id: row.problemId },
    select: { id: true, dataVersion: true, timeLimitMs: true, memoryLimitKb: true, checkerSource: true },
  });

  return {
    submissionId: row.id,
    claimToken,
    language: row.language,
    source: row.source,
    // IOI-তে আংশিক নম্বরের জন্য সব টেস্ট চালাতে হয়
    runAllTests: contest?.scoring === "IOI",
    problem: {
      id: problem.id,
      dataVersion: problem.dataVersion,
      timeLimitMs: problem.timeLimitMs,
      memoryLimitKb: problem.memoryLimitKb,
      hasChecker: problem.checkerSource !== null,
    },
  };
}
