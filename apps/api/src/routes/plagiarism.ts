// কনটেস্টের plagiarism রিপোর্ট — শুধু author/admin।

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PlagiarismCompare, PlagiarismReport } from "@vibejudge/shared";
import { prisma } from "../db.js";
import { requireUser } from "../auth/guards.js";
import { contestAccess, loadContestCached, type LoadedContest } from "../contest-access.js";
import { findSimilarPairs, matchedLines } from "../plagiarism.js";

// একই কনটেস্টে বারবার চাপলে প্রতিবার সব সোর্স কোড না পড়তে (১ মিনিট)
const REPORT_TTL_MS = 60_000;
const reportCache = new Map<string, { at: number; value: Promise<PlagiarismReport> }>();

async function managedContest(req: FastifyRequest<{ Params: { slug: string } }>, reply: FastifyReply) {
  const user = await requireUser(req, reply);
  if (!user) return null;
  const contest = await loadContestCached(req.params.slug);
  if (!contest) {
    reply.code(404).send({ error: "Contest not found" });
    return null;
  }
  if (!(await contestAccess(contest, user)).canManage) {
    reply.code(403).send({ error: "Only the contest author can see the plagiarism report" });
    return null;
  }
  return contest;
}

async function buildReport(contest: LoadedContest, minSimilarity: number): Promise<PlagiarismReport> {
  // কনটেস্ট চলাকালীন (standings-এ গোনা) সাবমিশন; CE/IE আর judge না হওয়াগুলো বাদ
  const subs = await prisma!.submission.findMany({
    // Codeforces থেকে আনা সাবমিশনে কোড নেই (শুধু লিংক) — বাদ
    where: {
      contestId: contest.id,
      inContest: true,
      remoteId: null,
      verdict: { notIn: ["PENDING", "JUDGING", "CE", "IE"] },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      problemId: true,
      verdict: true,
      source: true,
      language: true,
      userId: true,
      user: { select: { username: true } },
    },
  });

  // team contest-এ "মালিক" = টিম — সতীর্থদের কোড মিললে সেটা কপি না
  const teamOf = new Map(
    contest.teamSize
      ? (
          await prisma!.contestParticipant.findMany({
            where: { contestId: contest.id, teamId: { not: null } },
            select: { userId: true, team: { select: { name: true } } },
          })
        ).map((p) => [p.userId, p.team!.name])
      : [],
  );
  const ownerOf = (s: (typeof subs)[number]) => teamOf.get(s.userId ?? "") ?? s.user!.username;
  const shownName = (s: (typeof subs)[number]) => {
    const team = teamOf.get(s.userId ?? "");
    return team ? `${team} (${s.user!.username})` : s.user!.username;
  };

  // প্রতি প্রবলেমে প্রত্যেকের (বা প্রতিটা টিমের) একটা: শেষ AC, না থাকলে শেষ judged সাবমিশন
  const chosen = new Map<string, (typeof subs)[number]>();
  for (const s of subs) {
    if (!s.user) continue;
    const key = `${s.problemId}:${ownerOf(s)}`;
    const prev = chosen.get(key);
    if (!prev || (prev.verdict !== "AC" && s.verdict === "AC")) chosen.set(key, s);
  }

  return {
    minSimilarity,
    problems: contest.problems.map((cp) => {
      const list = [...chosen.values()].filter((s) => s.problemId === cp.problem.id);
      const names = new Map(list.map((s) => [s.id, shownName(s)]));
      const { pairs } = findSimilarPairs(
        list.map((s) => ({ id: s.id, owner: ownerOf(s), source: s.source, language: s.language })),
        { minSimilarity },
      );
      return {
        label: cp.label,
        title: cp.problem.title,
        compared: list.length,
        pairs: pairs.map((p) => ({
          similarity: p.similarity,
          a: { submissionId: p.a, username: names.get(p.a)! },
          b: { submissionId: p.b, username: names.get(p.b)! },
        })),
      };
    }),
    generatedAt: new Date().toISOString(),
  };
}

export async function plagiarismRoutes(app: FastifyInstance) {
  app.get<{ Params: { slug: string }; Querystring: { min?: number; fresh?: boolean } }>(
    "/contests/:slug/plagiarism",
    {
      schema: {
        querystring: {
          type: "object",
          properties: { min: { type: "integer", minimum: 10, maximum: 100 }, fresh: { type: "boolean" } },
        },
      },
    },
    async (req, reply) => {
      const contest = await managedContest(req, reply);
      if (!contest) return reply;
      const min = req.query.min ?? 50;
      const key = `${contest.id}:${min}`;
      const hit = reportCache.get(key);
      if (hit && !req.query.fresh && Date.now() - hit.at < REPORT_TTL_MS) return hit.value;

      const value = buildReport(contest, min).catch((err) => {
        reportCache.delete(key);
        throw err;
      });
      if (reportCache.size > 200) reportCache.clear();
      reportCache.set(key, { at: Date.now(), value });
      return value;
    },
  );

  app.get<{ Params: { slug: string }; Querystring: { a: string; b: string } }>(
    "/contests/:slug/plagiarism/compare",
    {
      schema: {
        querystring: {
          type: "object",
          required: ["a", "b"],
          properties: { a: { type: "string", maxLength: 40 }, b: { type: "string", maxLength: 40 } },
        },
      },
    },
    async (req, reply) => {
      const contest = await managedContest(req, reply);
      if (!contest) return reply;
      // দুটো সাবমিশনই এই কনটেস্টের হতে হবে (অন্য কনটেস্টের কোড এই পথে দেখা যাবে না)
      const subs = await prisma!.submission.findMany({
        where: { id: { in: [req.query.a, req.query.b] }, contestId: contest.id },
        select: { id: true, problemId: true, verdict: true, source: true, language: true, user: { select: { username: true } } },
      });
      const a = subs.find((s) => s.id === req.query.a);
      const b = subs.find((s) => s.id === req.query.b);
      if (!a || !b) return reply.code(404).send({ error: "Submission not found in this contest" });

      const m = matchedLines(a, b);
      const result: PlagiarismCompare = {
        similarity: m.similarity,
        label: contest.problems.find((cp) => cp.problem.id === a.problemId)?.label ?? "?",
        a: { submissionId: a.id, username: a.user?.username ?? "?", verdict: a.verdict, source: a.source, lines: m.a },
        b: { submissionId: b.id, username: b.user?.username ?? "?", verdict: b.verdict, source: b.source, lines: m.b },
      };
      return result;
    },
  );
}
