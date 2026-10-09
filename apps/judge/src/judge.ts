import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Language, Verdict } from "@vibejudge/shared";
import { Box, type RunResult } from "./isolate.js";
import { CHECKER_COMPILE, LANGUAGES } from "./languages.js";
import { compareTokens } from "./compare.js";

export interface TestCase {
  name: string;
  /** testDir-এর ভেতরে ফাইলের নাম */
  input: string;
  answer: string;
}

export interface ProblemSpec {
  timeLimitMs: number;
  memoryLimitKb: number;
  /** host-এ টেস্ট ফাইলগুলোর ফোল্ডার (sandbox-এ read-only "/tests" হিসেবে mount হয়) */
  testDir: string;
  tests: TestCase[];
  /** compile করা testlib checker-এর host path; না থাকলে token compare */
  checkerPath?: string;
}

export interface Submission {
  language: Language;
  source: string;
}

export type FinalVerdict = Exclude<Verdict, "PENDING" | "JUDGING">;

export interface TestResult {
  name: string;
  verdict: FinalVerdict;
  timeMs: number;
  memoryKb: number;
  message?: string;
}

export interface JudgeResult {
  verdict: FinalVerdict;
  /** সব টেস্টের মধ্যে সর্বোচ্চ */
  timeMs: number;
  memoryKb: number;
  compileOutput?: string;
  tests: TestResult[];
}

export interface JudgeOptions {
  /** প্রোগ্রাম চালানোর box; compile হয় boxId + COMPILE_BOX_OFFSET-এ */
  boxId: number;
  /** প্রথম ভুল টেস্টে থামবে (ICPC); false হলে সব টেস্ট চলবে (IOI) */
  stopOnFirstFailure?: boolean;
}

const COMPILE_LIMITS = {
  timeMs: 10_000,
  wallTimeMs: 20_000,
  memoryKb: 512 * 1024,
  processes: 64,
  fileSizeKb: 64 * 1024,
};
const COMPILE_ENV = { PATH: "/usr/bin:/bin" };
const MAX_LOG = 8 * 1024;
// Compile আলাদা box-এ হয়: একই box-এ হলে compiler-এর পড়া header-এর page cache
// cgroup-এ থেকে যায় আর প্রোগ্রামের memory হিসেবে গোনা হয় (~270 MB বাড়তি দেখায়)।
export const COMPILE_BOX_OFFSET = 500;

export async function judge(problem: ProblemSpec, submission: Submission, opts: JudgeOptions): Promise<JudgeResult> {
  const lang = LANGUAGES[submission.language];
  const compileBox = await Box.create(opts.boxId + COMPILE_BOX_OFFSET);
  let box: Box | undefined;
  try {
    // ---- 1. Compile ----
    await writeFile(join(compileBox.dir, lang.sourceFile), submission.source);
    const compile = await compileBox.run(lang.compile, {
      limits: COMPILE_LIMITS,
      stdout: "compile.txt",
      stderr: "compile.txt",
      env: COMPILE_ENV,
    });
    const compileOutput = await readText(join(compileBox.dir, "compile.txt"));
    if (compile.status) {
      const why = compile.status === "TO" ? "Compilation timed out.\n" : "";
      return { verdict: "CE", timeMs: 0, memoryKb: 0, compileOutput: why + compileOutput, tests: [] };
    }

    box = await Box.create(opts.boxId);
    await copyFile(join(compileBox.dir, "main"), join(box.dir, "main"));

    // ---- 2. প্রতিটা টেস্ট চালানো ----
    const results: TestResult[] = [];
    for (const test of problem.tests) {
      const result = await runTest(box, problem, lang.run, test);
      results.push(result);
      if (result.verdict !== "AC" && opts.stopOnFirstFailure !== false) break;
    }

    const failed = results.find((r) => r.verdict !== "AC");
    return {
      verdict: failed?.verdict ?? "AC",
      timeMs: Math.max(0, ...results.map((r) => r.timeMs)),
      memoryKb: Math.max(0, ...results.map((r) => r.memoryKb)),
      compileOutput: compileOutput || undefined,
      tests: results,
    };
  } finally {
    await compileBox.destroy();
    await box?.destroy();
  }
}

async function runTest(box: Box, problem: ProblemSpec, command: string[], test: TestCase): Promise<TestResult> {
  const outPath = join(box.dir, "out.txt");
  await rm(outPath, { force: true });

  const run = await box.run(command, {
    limits: {
      timeMs: problem.timeLimitMs,
      wallTimeMs: Math.max(problem.timeLimitMs * 3, problem.timeLimitMs + 2000),
      memoryKb: problem.memoryLimitKb,
    },
    stdin: `/tests/${test.input}`,
    stdout: "out.txt",
    stderr: "/dev/null",
    mounts: { "/tests": problem.testDir },
  });

  const base = { name: test.name, timeMs: run.timeMs, memoryKb: run.memoryKb };
  const runVerdict = verdictFromRun(run, problem);
  if (runVerdict) return { ...base, ...runVerdict };

  // প্রোগ্রাম ঠিকমতো শেষ হয়েছে — এবার output যাচাই
  if (problem.checkerPath) {
    return { ...base, ...(await runChecker(box, problem, test)) };
  }
  const cmp = compareTokens(await readFile(outPath), await readFile(join(problem.testDir, test.answer)));
  return { ...base, verdict: cmp.ok ? "AC" : "WA", message: cmp.message };
}

function verdictFromRun(run: RunResult, problem: ProblemSpec): { verdict: FinalVerdict; message?: string } | null {
  const nearMemLimit = run.memoryKb >= problem.memoryLimitKb * 0.95;
  if (run.status === "XX") return { verdict: "IE", message: run.message };
  if (run.status === "TO" || run.timeMs > problem.timeLimitMs) return { verdict: "TLE", message: run.message };
  if (run.oomKilled || (run.status && nearMemLimit)) return { verdict: "MLE" };
  if (run.status === "SG") {
    // SIGXFSZ (25) = output ফাইল সাইজ সীমা ছাড়িয়েছে
    const msg = run.signal === 25 ? "Output limit exceeded" : `Killed by signal ${run.signal}`;
    return { verdict: "RE", message: msg };
  }
  if (run.status === "RE") return { verdict: "RE", message: `Exit code ${run.exitCode}` };
  return null;
}

// testlib checker exit code: 0 = OK, 1 = WA, 2 = PE, 3 = FAIL (checker/answer-এ সমস্যা), 7 = partial points
async function runChecker(
  box: Box,
  problem: ProblemSpec,
  test: TestCase,
): Promise<{ verdict: FinalVerdict; message?: string }> {
  const checkerDir = dirname(problem.checkerPath!);
  const run = await box.run(["/checker/checker", `/tests/${test.input}`, "out.txt", `/tests/${test.answer}`], {
    limits: { timeMs: 10_000, wallTimeMs: 20_000, memoryKb: 1024 * 1024 },
    stdout: "/dev/null",
    stderr: "checker.txt",
    mounts: { "/tests": problem.testDir, "/checker": checkerDir },
  });
  const message = (await readText(join(box.dir, "checker.txt"))).trim();

  if (!run.status) return { verdict: "AC", message };
  if (run.status === "RE" && (run.exitCode === 1 || run.exitCode === 2)) return { verdict: "WA", message };
  return { verdict: "IE", message: `Checker failed (${run.status}, exit ${run.exitCode}): ${message}` };
}

/** testlib checker সোর্স compile করে outDir/checker-এ রাখে, compile error হলে throw করে */
export async function compileChecker(sourcePath: string, outDir: string, boxId: number): Promise<string> {
  const box = await Box.create(boxId);
  try {
    await copyFile(sourcePath, join(box.dir, "checker.cpp"));
    const res = await box.run(CHECKER_COMPILE, {
      limits: { ...COMPILE_LIMITS, timeMs: 60_000, wallTimeMs: 90_000 },
      stdout: "compile.txt",
      stderr: "compile.txt",
      env: COMPILE_ENV,
      mounts: { "/opt/testlib": "/opt/testlib" },
    });
    if (res.status) {
      throw new Error(`Checker compilation failed:\n${await readText(join(box.dir, "compile.txt"))}`);
    }
    await mkdir(outDir, { recursive: true });
    const out = join(outDir, "checker");
    await copyFile(join(box.dir, "checker"), out);
    return out;
  } finally {
    await box.destroy();
  }
}

async function readText(path: string): Promise<string> {
  try {
    const buf = await readFile(path);
    const text = buf.subarray(0, MAX_LOG).toString("utf8");
    return buf.length > MAX_LOG ? `${text}\n… (truncated)` : text;
  } catch {
    return "";
  }
}
