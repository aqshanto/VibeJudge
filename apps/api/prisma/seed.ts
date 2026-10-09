// ডেমো প্রবলেম DB-তে ঢোকায় (judge-এর fixtures থেকে টেস্ট নিয়ে)।
// চালাও: pnpm --filter @vibejudge/api db:seed   — বারবার চালালেও সমস্যা নেই।

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "../src/db.js";

const FIXTURES = join(import.meta.dirname, "../../judge/fixtures");

const PROBLEMS = [
  {
    slug: "aplusb",
    title: "A + B",
    statement: `Given two integers $a$ and $b$, print $a + b$.

## Input
A single line with two integers $a$ and $b$ ($|a|, |b| \\le 3 \\cdot 10^9$).

## Output
Print one integer — the sum $a + b$.

> Careful: the answer may not fit in a 32-bit \`int\`.`,
    samples: 2,
  },
  {
    slug: "sum-split",
    title: "Sum Split",
    statement: `Given an integer $n$, find two **positive** integers $a$ and $b$ such that $a + b = n$.

## Input
A single integer $n$ ($2 \\le n \\le 10^9$).

## Output
Print $a$ and $b$. If there are several answers, print any of them.`,
    samples: 2,
  },
];

async function main() {
  if (!prisma) throw new Error("DATABASE_URL is not set (apps/api/.env)");

  for (const p of PROBLEMS) {
    const dir = join(FIXTURES, p.slug);
    const config = JSON.parse(await readFile(join(dir, "problem.json"), "utf8")) as {
      timeLimitMs: number;
      memoryLimitKb: number;
    };
    const files = await readdir(dir);
    const checkerSource = files.includes("checker.cpp") ? await readFile(join(dir, "checker.cpp"), "utf8") : null;
    const inputs = (await readdir(join(dir, "tests"))).filter((f) => f.endsWith(".in")).sort();

    const tests = await Promise.all(
      inputs.map(async (f, i) => ({
        ordinal: i + 1,
        input: await readFile(join(dir, "tests", f)),
        answer: await readFile(join(dir, "tests", f.replace(/\.in$/, ".ans"))),
        isSample: i < p.samples,
      })),
    );

    const data = {
      title: p.title,
      statement: p.statement,
      timeLimitMs: config.timeLimitMs,
      memoryLimitKb: config.memoryLimitKb,
      checkerSource,
      visibility: "PUBLIC" as const,
    };

    await prisma.$transaction(async (tx) => {
      const problem = await tx.problem.upsert({
        where: { slug: p.slug },
        create: { slug: p.slug, ...data },
        // টেস্ট বদলাতে পারে, তাই worker-এর cache বাতিল করতে version বাড়াই
        update: { ...data, dataVersion: { increment: 1 } },
      });
      await tx.testCase.deleteMany({ where: { problemId: problem.id } });
      await tx.testCase.createMany({ data: tests.map((t) => ({ ...t, problemId: problem.id })) });
    });
    console.log(`seeded ${p.slug} (${tests.length} tests${checkerSource ? ", checker" : ""})`);
  }
}

await main();
await prisma?.$disconnect();
