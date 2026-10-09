// Judge worker: API থেকে সাবমিশন টেনে এনে judge করে, রেজাল্ট ফেরত পাঠায়।
//
// Environment:
//   API_URL       যেমন https://vibejudge-api.onrender.com (লোকালি http://host.docker.internal:4000)
//   JUDGE_TOKEN   API-র JUDGE_TOKEN-এর সাথে মিলতে হবে
//   CONCURRENCY   একসাথে কয়টা সাবমিশন (ডিফল্ট: CPU সংখ্যা - 1)
//   WORKER_NAME   লগে দেখানোর নাম (ডিফল্ট: hostname)
//   DATA_DIR      টেস্ট ডাটার cache (ডিফল্ট: /var/lib/vibejudge)

import { availableParallelism, hostname } from "node:os";
import type { JudgeJob, JudgeReport } from "@vibejudge/shared";
import { JudgeApi } from "./api.js";
import { judge } from "./judge.js";
import { ProblemCache } from "./problems.js";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing environment variable ${name}`);
    process.exit(1);
  }
  return value;
}

const apiUrl = requireEnv("API_URL").replace(/\/+$/, "");
const token = requireEnv("JUDGE_TOKEN");
const workerName = process.env.WORKER_NAME?.trim() || hostname();
const concurrency = Number(process.env.CONCURRENCY) || Math.max(1, availableParallelism() - 1);
const dataDir = process.env.DATA_DIR?.trim() || "/var/lib/vibejudge";

const api = new JudgeApi(apiUrl, token, workerName);
const problems = new ProblemCache(api, dataDir);
let stopping = false;

const log = (slot: number, msg: string) => console.log(`${new Date().toISOString()} [slot ${slot}] ${msg}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function process1(job: JudgeJob, slot: number): Promise<JudgeReport> {
  try {
    const problem = await problems.get(job.problem, slot);
    const result = await judge(problem, { language: job.language, source: job.source }, {
      boxId: slot,
      stopOnFirstFailure: !job.runAllTests,
    });
    return { claimToken: job.claimToken, ...result };
  } catch (err) {
    // judge-এর নিজের সমস্যা — সাবমিশন যেন আটকে না থাকে, IE দিয়ে দিই
    log(slot, `internal error on ${job.submissionId}: ${(err as Error).stack ?? err}`);
    return {
      claimToken: job.claimToken,
      verdict: "IE",
      timeMs: 0,
      memoryKb: 0,
      compileOutput: `Internal judge error: ${(err as Error).message}`.slice(0, 4000),
      tests: [],
    };
  }
}

async function reportWithRetry(job: JudgeJob, report: JudgeReport, slot: number): Promise<void> {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await api.report(job.submissionId, report);
      return;
    } catch (err) {
      log(slot, `report failed (attempt ${attempt}): ${(err as Error).message}`);
      await sleep(attempt * 2000);
    }
  }
  // ছেড়ে দিই — API ১০ মিনিট পর সাবমিশনটা আবার কিউতে ফেরত দেবে
}

async function slotLoop(slot: number): Promise<void> {
  let backoff = 1000;
  while (!stopping) {
    let job: JudgeJob | null;
    try {
      job = await api.claim();
      backoff = 1000;
    } catch (err) {
      log(slot, `claim failed: ${(err as Error).message} — retrying in ${backoff / 1000}s`);
      await sleep(backoff);
      backoff = Math.min(backoff * 2, 30_000);
      continue;
    }
    if (!job) continue;

    const started = Date.now();
    const report = await process1(job, slot);
    await reportWithRetry(job, report, slot);
    log(
      slot,
      `${job.submissionId} ${job.language} → ${report.verdict} (${report.timeMs} ms, ${report.memoryKb} KB) ` +
        `judged in ${Date.now() - started} ms`,
    );
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (stopping) process.exit(1);
    stopping = true;
    console.log(`${signal} received — finishing current submissions (send again to force quit)`);
  });
}

console.log(`VibeJudge judge worker "${workerName}" → ${apiUrl} with ${concurrency} slot(s)`);
await Promise.all(Array.from({ length: concurrency }, (_, slot) => slotLoop(slot)));
console.log("worker stopped");
