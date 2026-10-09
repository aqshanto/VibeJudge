// End-to-end test: fixtures-এর প্রতিটা সমাধান API দিয়ে সাবমিট করে (যেমন ইউজার করবে),
// worker judge করার পর verdict মেলায়। API, DB আর অন্তত একটা worker চালু থাকতে হবে।
//
//   node apps/judge/scripts/e2e.mjs [API base, default http://localhost:4000/api]
//
// প্রবলেমগুলো আগে seed করা থাকতে হবে: pnpm --filter @vibejudge/api db:seed

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "../fixtures");
const base = (process.argv[2] ?? "http://localhost:4000/api").replace(/\/+$/, "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function submit(body) {
  for (;;) {
    const res = await fetch(`${base}/submissions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    // API-তে IP প্রতি মিনিটে ১০টা সাবমিশনের সীমা আছে
    if (res.status === 429) {
      console.log("rate limited — waiting 60 s");
      await sleep(60_000);
      continue;
    }
    if (res.status !== 201) throw new Error(`submit HTTP ${res.status}: ${await res.text()}`);
    return (await res.json()).id;
  }
}

const subs = [];
for (const slug of readdirSync(root).sort()) {
  for (const file of readdirSync(join(root, slug, "solutions")).sort()) {
    const language = file.endsWith(".cpp") ? "cpp" : file.endsWith(".c") ? "c" : null;
    if (!language) continue;
    const source = readFileSync(join(root, slug, "solutions", file), "utf8");
    const id = await submit({ problemSlug: slug, language, source });
    subs.push({ name: `${slug}/${file}`, expected: file.split(/[-.]/)[0].toUpperCase(), id });
  }
}

let failures = 0;
for (const s of subs) {
  let v;
  do {
    await sleep(500);
    v = await (await fetch(`${base}/submissions/${s.id}`)).json();
  } while (v.verdict === "PENDING" || v.verdict === "JUDGING");

  const ok = v.verdict === s.expected;
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${s.name.padEnd(34)} expected ${s.expected.padEnd(3)} got ${v.verdict.padEnd(3)}` +
      `  ${String(v.timeMs).padStart(5)} ms  ${String(v.memoryKb).padStart(7)} KB`,
  );
}
console.log(`\n${subs.length - failures}/${subs.length} passed`);
process.exit(failures ? 1 : 0);
