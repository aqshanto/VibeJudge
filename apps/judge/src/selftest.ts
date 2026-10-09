// Judge self-test: fixtures ফোল্ডারের প্রতিটা প্রবলেমের প্রতিটা সমাধান judge করে,
// ফাইলের নামের শুরুর verdict (যেমন "tle-loop.cpp" → TLE) এর সাথে মিলিয়ে দেখে।
//
// fixtures/<problem>/problem.json   { "timeLimitMs": 1000, "memoryLimitKb": 262144 }
// fixtures/<problem>/tests/*.in, *.ans
// fixtures/<problem>/checker.cpp     (ঐচ্ছিক, testlib checker)
// fixtures/<problem>/solutions/<verdict>-*.{c,cpp}

import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { tmpdir } from "node:os";
import type { Language } from "@vibejudge/shared";
import { compileChecker, judge, type ProblemSpec } from "./judge.js";

const EXT: Record<string, Language> = { ".c": "c", ".cpp": "cpp" };

async function loadProblem(dir: string, name: string): Promise<ProblemSpec> {
  const config = JSON.parse(await readFile(join(dir, "problem.json"), "utf8")) as {
    timeLimitMs: number;
    memoryLimitKb: number;
  };
  const testDir = join(dir, "tests");
  const inputs = (await readdir(testDir)).filter((f) => f.endsWith(".in")).sort();
  const files = await readdir(dir);
  const checkerPath = files.includes("checker.cpp")
    ? await compileChecker(join(dir, "checker.cpp"), join(tmpdir(), "vj-checkers", name), 999)
    : undefined;

  return {
    ...config,
    testDir,
    tests: inputs.map((f) => ({ name: f.replace(/\.in$/, ""), input: f, answer: f.replace(/\.in$/, ".ans") })),
    checkerPath,
  };
}

async function main() {
  const root = process.argv[2] ?? "/fixtures";
  let failures = 0;
  let total = 0;

  for (const name of (await readdir(root)).sort()) {
    const dir = join(root, name);
    const problem = await loadProblem(dir, name);
    console.log(
      `\n== ${name} (${problem.tests.length} tests, ${problem.timeLimitMs} ms, ${problem.memoryLimitKb / 1024} MB` +
        `${problem.checkerPath ? ", testlib checker" : ""}) ==`,
    );

    for (const file of (await readdir(join(dir, "solutions"))).sort()) {
      const language = EXT[extname(file)];
      if (!language) continue;
      const expected = file.split(/[-.]/)[0]!.toUpperCase();
      const source = await readFile(join(dir, "solutions", file), "utf8");

      const started = Date.now();
      const result = await judge(problem, { language, source }, { boxId: 0 });
      const took = Date.now() - started;

      total++;
      const ok = result.verdict === expected;
      if (!ok) failures++;
      const failed = result.tests.find((t) => t.verdict !== "AC");
      const detail = result.verdict === "CE" ? firstLine(result.compileOutput) : (failed?.message ?? "");
      console.log(
        `${ok ? "PASS" : "FAIL"}  ${file.padEnd(22)} expected ${expected.padEnd(3)} got ${result.verdict.padEnd(3)}` +
          `  ${String(result.timeMs).padStart(5)} ms  ${String(result.memoryKb).padStart(7)} KB` +
          `  (judged in ${took} ms)${failed ? `  [test ${failed.name}] ${detail}` : ""}`,
      );
    }
  }

  console.log(`\n${total - failures}/${total} passed`);
  process.exit(failures ? 1 : 0);
}

function firstLine(text?: string): string {
  return (text ?? "").split("\n").find((l) => l.includes("error")) ?? "";
}

await main();
