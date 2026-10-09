// প্রবলেমের টেস্ট ডাটা আর compile করা checker লোকাল ডিস্কে cache করে।
// ফোল্ডার: <dataDir>/problems/<id>/v<dataVersion>/ — version বদলালে নতুন করে নামায়।

import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { JudgeJob } from "@vibejudge/shared";
import type { JudgeApi } from "./api.js";
import { compileChecker, type ProblemSpec } from "./judge.js";

/** checker compile-এর box (run = slot, compile = slot + 500) */
const CHECKER_BOX_OFFSET = 900;

export class ProblemCache {
  private readonly inflight = new Map<string, Promise<ProblemSpec>>();

  constructor(
    private readonly api: JudgeApi,
    private readonly dataDir: string,
  ) {}

  get(problem: JudgeJob["problem"], slot: number): Promise<ProblemSpec> {
    const key = `${problem.id}@${problem.dataVersion}`;
    let pending = this.inflight.get(key);
    if (!pending) {
      pending = this.load(problem, slot).catch((err) => {
        this.inflight.delete(key); // পরের বার আবার চেষ্টা করবে
        throw err;
      });
      this.inflight.set(key, pending);
    }
    return pending;
  }

  private async load(problem: JudgeJob["problem"], slot: number): Promise<ProblemSpec> {
    const problemDir = join(this.dataDir, "problems", problem.id);
    const dir = join(problemDir, `v${problem.dataVersion}`);
    const testDir = join(dir, "tests");
    const checkerDir = join(dir, "checker");
    const ready = join(dir, ".ready");

    if (!(await exists(ready))) {
      const data = await this.api.problemData(problem.id);
      await rm(dir, { recursive: true, force: true });
      await mkdir(testDir, { recursive: true });
      for (const t of data.tests) {
        await writeFile(join(testDir, `${t.name}.in`), Buffer.from(t.input, "base64"));
        await writeFile(join(testDir, `${t.name}.ans`), Buffer.from(t.answer, "base64"));
      }
      if (data.checkerSource) {
        const src = join(dir, "checker.cpp");
        await writeFile(src, data.checkerSource);
        await compileChecker(src, checkerDir, CHECKER_BOX_OFFSET + slot);
      }
      await writeFile(ready, String(data.dataVersion));
      await removeOldVersions(problemDir, `v${problem.dataVersion}`);
    }

    const names = (await readdir(testDir))
      .filter((f) => f.endsWith(".in"))
      .map((f) => f.slice(0, -3))
      .sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));

    return {
      timeLimitMs: problem.timeLimitMs,
      memoryLimitKb: problem.memoryLimitKb,
      testDir,
      tests: names.map((name) => ({ name, input: `${name}.in`, answer: `${name}.ans` })),
      checkerPath: problem.hasChecker ? join(checkerDir, "checker") : undefined,
    };
  }
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

async function removeOldVersions(problemDir: string, keep: string): Promise<void> {
  for (const entry of await readdir(problemDir)) {
    if (entry !== keep) await rm(join(problemDir, entry), { recursive: true, force: true });
  }
}
