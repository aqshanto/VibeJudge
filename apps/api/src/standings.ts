// Standings হিসাব — DB ছাড়া pure function (সহজে টেস্ট করা যায়), আর তার উপরে একটা ছোট cache।

import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import type { ScoringType, StandingsCell, StandingsRow, StandingsView, Verdict } from "@vibejudge/shared";

export interface StandingsInput {
  scoring: ScoringType;
  penaltyMinutes: number;
  /** এই সময়ের পরের সাবমিশন লুকানো থাকবে (null = freeze নেই/দর্শক author) */
  freezeAt: Date | null;
  /**
   * virtual চলাকালীন "ভূত" standings: প্রত্যেকের নিজের শুরু থেকে এত ms পরের সাবমিশন বাদ
   * (যাতে আসলদের ঠিক ততক্ষণের অবস্থার সাথে তুলনা হয়)
   */
  cutoffMs?: number;
  problems: { problemId: string; label: string; title: string }[];
  participants: {
    userId: string;
    /** নিজের শুরু (FIXED-এ কনটেস্টের শুরু); WINDOW-এ Start না চাপলে null */
    startedAt: Date | null;
    virtual: boolean;
    username: string;
    displayName: string | null;
    institution: string | null;
    batch: string | null;
    section: string | null;
  }[];
  /** শুধু inContest সাবমিশন, createdAt অনুযায়ী সাজানো */
  submissions: { userId: string; problemId: string; verdict: Verdict; score: number | null; createdAt: Date }[];
}

// এগুলোতে penalty নেই আর ভুল হিসেবেও গোনা হয় না
const IGNORED: Verdict[] = ["CE", "IE"];

const emptyCell = (): StandingsCell => ({
  solved: false,
  wrong: 0,
  solvedAtMinute: null,
  firstSolve: false,
  score: null,
  pending: 0,
});

export function computeStandings(input: StandingsInput): Omit<StandingsView, "generatedAt"> {
  const labelOf = new Map(input.problems.map((p) => [p.problemId, p.label]));
  const cells = new Map<string, Map<string, StandingsCell>>(); // userId → label → cell
  for (const p of input.participants) {
    cells.set(p.userId, new Map(input.problems.map((pr) => [pr.label, emptyCell()])));
  }
  // প্রবলেম অনুযায়ী সবার আগে AC (firstSolve)
  const firstAc = new Map<string, { userId: string; at: number }>();

  const who = new Map(input.participants.map((p) => [p.userId, p]));

  for (const s of input.submissions) {
    const label = labelOf.get(s.problemId);
    const cell = label && cells.get(s.userId)?.get(label);
    const p = who.get(s.userId);
    if (!cell || !label || !p?.startedAt) continue; // রেজিস্ট্রেশন মুছে গেছে বা প্রবলেম সরানো হয়েছে
    const elapsedMs = s.createdAt.getTime() - p.startedAt.getTime();
    if (input.cutoffMs !== undefined && elapsedMs > input.cutoffMs) continue;

    const hidden = input.freezeAt !== null && s.createdAt >= input.freezeAt;
    const judging = s.verdict === "PENDING" || s.verdict === "JUDGING";

    if (input.scoring === "ICPC") {
      if (cell.solved) continue; // AC-এর পরের সাবমিশন গোনা হয় না
      if (hidden || judging) {
        cell.pending++;
        continue;
      }
      if (IGNORED.includes(s.verdict)) continue;
      if (s.verdict === "AC") {
        cell.solved = true;
        cell.solvedAtMinute = Math.floor(elapsedMs / 60_000);
        // "সবার আগে" শুধু আসলদের মধ্যে, নিজের শুরু থেকে কত দ্রুত
        const prev = firstAc.get(label);
        if (!p.virtual && (!prev || elapsedMs < prev.at)) firstAc.set(label, { userId: s.userId, at: elapsedMs });
      } else {
        cell.wrong++;
      }
    } else {
      if (hidden || judging) {
        cell.pending++;
        continue;
      }
      if (s.verdict === "IE") continue; // judge-এর সমস্যা — প্রতিযোগীর দোষ না
      const score = s.verdict === "CE" ? 0 : (s.score ?? (s.verdict === "AC" ? 100 : 0));
      cell.score = Math.max(cell.score ?? 0, score);
      if (!IGNORED.includes(s.verdict) && s.verdict !== "AC") cell.wrong++;
    }
  }

  for (const [label, first] of firstAc) {
    const cell = cells.get(first.userId)?.get(label);
    if (cell) cell.firstSolve = true;
  }

  const rows: StandingsRow[] = input.participants.map((p) => {
    const mine = cells.get(p.userId)!;
    let points = 0;
    let penalty = 0;
    for (const cell of mine.values()) {
      if (input.scoring === "ICPC") {
        if (cell.solved) {
          points++;
          penalty += cell.solvedAtMinute! + cell.wrong * input.penaltyMinutes;
        }
      } else {
        points += cell.score ?? 0;
      }
    }
    return {
      rank: 0,
      username: p.username,
      displayName: p.displayName,
      institution: p.institution,
      batch: p.batch,
      section: p.section,
      points,
      penalty,
      cells: Object.fromEntries(mine),
      virtual: p.virtual,
    };
  });

  // বেশি points আগে, তারপর কম penalty; সমান হলে একই rank (তারপর নাম অনুযায়ী সাজানো)
  const better = (a: StandingsRow, b: StandingsRow) => b.points - a.points || a.penalty - b.penalty;
  rows.sort((a, b) => better(a, b) || Number(a.virtual) - Number(b.virtual) || a.username.localeCompare(b.username));
  // rank শুধু আসলদের মধ্যে; virtual-এর rank = আসলদের মধ্যে কোথায় পড়ত (আসলদের rank বদলায় না)
  const real = rows.filter((r) => !r.virtual);
  real.forEach((row, i) => {
    const prev = real[i - 1];
    row.rank = prev && better(prev, row) === 0 ? prev.rank : i + 1;
  });
  for (const row of rows) {
    if (row.virtual) row.rank = 1 + real.filter((r) => better(r, row) < 0).length;
  }

  const problems = input.problems.map((p) => {
    let solvedBy = 0;
    let triedBy = 0;
    for (const row of real) {
      const c = row.cells[p.label]!;
      const tried = c.solved || c.wrong > 0 || c.pending > 0 || c.score !== null;
      if (tried) triedBy++;
      if (input.scoring === "ICPC" ? c.solved : c.score === 100) solvedBy++;
    }
    return { label: p.label, title: p.title, solvedBy, triedBy };
  });

  return { scoring: input.scoring, frozen: input.freezeAt !== null, problems, rows };
}

// ---------- Cache ----------
// ১০০০ জন প্রতি ৩০ সেকেন্ডে চাইলেও DB-তে কয়েক সেকেন্ডে একটা query যায়।
// একই সময়ে অনেক request এলে সবাই একই চলতি হিসাবের (promise) ফল পায়।
// JSON একবারই বানানো হয় (১০০০ জনের standings ~৩০০ KB — প্রতিবার stringify করলে CPU খায়),
// আর ETag দিয়ে না বদলালে ব্রাউজার শুধু 304 পায় (freeze-এর সময় প্রায় সবসময়)।

export interface CachedStandings {
  json: string;
  /** একবারই gzip করা কপি — প্রতি request-এ ৩০০ KB আবার compress করলে CPU আটকে যায় */
  gzip: Buffer;
  etag: string;
}

const cache = new Map<string, { at: number; value: Promise<CachedStandings> }>();

export function cachedStandings(
  key: string,
  ttlMs: number,
  compute: () => Promise<Omit<StandingsView, "generatedAt">>,
): Promise<CachedStandings> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = compute()
    .then((view) => {
      // ETag শুধু আসল ডেটা থেকে (generatedAt বাদে) — কিছু না বদলালে একই থাকে
      const etag = `"${createHash("sha1").update(JSON.stringify(view)).digest("base64url")}"`;
      const json = JSON.stringify({ ...view, generatedAt: new Date().toISOString() } satisfies StandingsView);
      return { json, gzip: gzipSync(json), etag };
    })
    .catch((err) => {
      cache.delete(key); // ভুল হলে পরের বার আবার চেষ্টা
      throw err;
    });
  if (cache.size > 500) cache.clear();
  cache.set(key, { at: Date.now(), value });
  return value;
}
