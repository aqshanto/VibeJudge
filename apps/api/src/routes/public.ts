// ওয়েবসাইটের জন্য পাবলিক endpoint (প্রবলেম দেখা, সাবমিট, সাবমিশন দেখা)।

import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  LANGUAGES,
  MAX_SOURCE_BYTES,
  type AuthUser,
  type Language,
  type ProblemView,
  type SubmissionPage,
  type SubmissionView,
  type TestResult,
} from "@vibejudge/shared";
import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../db.js";
import { notifyWork } from "../queue.js";
import { requireUser } from "../auth/guards.js";
import { SESSION_COOKIE, getSessionUser } from "../auth/session.js";

/** PUBLIC সবাই দেখে; PRIVATE/CONTEST শুধু তার author আর admin (প্রকাশের আগে যাচাইয়ের জন্য) */
function visibleProblem(slug: string, viewer: AuthUser | null): Prisma.ProblemWhereInput {
  if (viewer?.role === "ADMIN") return { slug };
  if (viewer) return { slug, OR: [{ visibility: "PUBLIC" }, { authorId: viewer.id }] };
  return { slug, visibility: "PUBLIC" };
}

/** PUBLIC প্রবলেমের সাবমিশন সবাই দেখে; বাকিগুলো শুধু নিজের, প্রবলেমের author-এর আর admin-এর */
function visibleSubmissions(viewer: AuthUser | null): Prisma.SubmissionWhereInput {
  if (viewer?.role === "ADMIN") return {};
  if (viewer) {
    return {
      OR: [{ problem: { visibility: "PUBLIC" } }, { userId: viewer.id }, { problem: { authorId: viewer.id } }],
    };
  }
  return { problem: { visibility: "PUBLIC" } };
}

export async function publicRoutes(app: FastifyInstance) {
  app.get("/problems", async () => {
    return prisma!.problem.findMany({
      where: { visibility: "PUBLIC" },
      orderBy: { createdAt: "asc" },
      select: { slug: true, title: true, timeLimitMs: true, memoryLimitKb: true },
    });
  });

  app.get<{ Params: { slug: string } }>("/problems/:slug", async (req, reply) => {
    const problem = await prisma!.problem.findFirst({
      where: visibleProblem(req.params.slug, await getSessionUser(req)),
      include: { tests: { where: { isSample: true }, orderBy: { ordinal: "asc" } } },
    });
    if (!problem) return reply.code(404).send({ error: "Problem not found" });

    const view: ProblemView = {
      id: problem.id,
      slug: problem.slug,
      title: problem.title,
      visibility: problem.visibility,
      statement: problem.statement,
      timeLimitMs: problem.timeLimitMs,
      memoryLimitKb: problem.memoryLimitKb,
      samples: problem.tests.map((t) => ({
        input: Buffer.from(t.input).toString("utf8"),
        answer: Buffer.from(t.answer).toString("utf8"),
      })),
    };
    return view;
  });

  app.post<{ Body: { problemSlug: string; language: Language; source: string } }>(
    "/submissions",
    {
      // ইউজার (session) প্রতি মিনিটে ১০টা — IP ধরে না, কারণ ল্যাবের সবাই একই IP শেয়ার করে
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute",
          keyGenerator: (req: FastifyRequest) => req.cookies[SESSION_COOKIE] ?? req.ip,
        },
      },
      schema: {
        body: {
          type: "object",
          required: ["problemSlug", "language", "source"],
          properties: {
            problemSlug: { type: "string", maxLength: 100 },
            language: { type: "string", enum: [...LANGUAGES] },
            source: { type: "string", minLength: 1 },
          },
        },
      },
    },
    async (req, reply) => {
      const user = await requireUser(req, reply);
      if (!user) return reply;
      const { problemSlug, language, source } = req.body;
      if (Buffer.byteLength(source) > MAX_SOURCE_BYTES) {
        return reply.code(413).send({ error: `Source code is larger than ${MAX_SOURCE_BYTES / 1024} KB` });
      }
      const problem = await prisma!.problem.findFirst({
        where: visibleProblem(problemSlug, user),
        select: { id: true },
      });
      if (!problem) return reply.code(404).send({ error: "Problem not found" });

      const submission = await prisma!.submission.create({
        data: { problemId: problem.id, userId: user.id, language, source },
        select: { id: true },
      });
      notifyWork();
      return reply.code(201).send(submission);
    },
  );

  app.get<{ Querystring: { mine?: boolean; user?: string; problem?: string; cursor?: string; limit?: number } }>(
    "/submissions",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            mine: { type: "boolean" },
            user: { type: "string", maxLength: 40 },
            problem: { type: "string", maxLength: 100 },
            cursor: { type: "string", maxLength: 40 },
            limit: { type: "integer", minimum: 1, maximum: 100 },
          },
        },
      },
    },
    async (req, reply) => {
      const viewer = await getSessionUser(req);
      const q = req.query;
      if (q.mine && !viewer) return reply.code(401).send({ error: "Please log in first" });
      const limit = q.limit ?? 50;

      const where: Prisma.SubmissionWhereInput = {
        AND: [
          visibleSubmissions(viewer),
          q.mine ? { userId: viewer!.id } : {},
          q.user ? { user: { username: q.user.toLowerCase() } } : {},
          q.problem ? { problem: { slug: q.problem } } : {},
        ],
      };
      const rows = await prisma!.submission.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
        select: {
          id: true,
          language: true,
          verdict: true,
          timeMs: true,
          memoryKb: true,
          createdAt: true,
          problem: { select: { slug: true, title: true } },
          user: { select: { username: true } },
        },
      });

      const page: SubmissionPage = {
        submissions: rows.slice(0, limit).map((s) => ({ ...s, createdAt: s.createdAt.toISOString() })),
        nextCursor: rows.length > limit ? rows[limit - 1]!.id : null,
      };
      return page;
    },
  );

  app.get<{ Params: { id: string } }>("/submissions/:id", async (req, reply) => {
    const viewer = await getSessionUser(req);
    // Private প্রবলেমের সাবমিশন (এমনকি verdict আর প্রবলেমের নামও) বাইরের কেউ দেখবে না
    const s = await prisma!.submission.findFirst({
      where: { AND: [{ id: req.params.id }, visibleSubmissions(viewer)] },
      include: { problem: { select: { slug: true, title: true } }, user: { select: { username: true } } },
    });
    if (!s) return reply.code(404).send({ error: "Submission not found" });

    // সোর্স কোড আর compiler output শুধু নিজের (বা Admin) — অন্যরা শুধু verdict দেখবে
    const canSeeCode = viewer !== null && (viewer.id === s.userId || viewer.role === "ADMIN");

    const view: SubmissionView = {
      id: s.id,
      problem: s.problem,
      user: s.user,
      language: s.language,
      source: canSeeCode ? s.source : null,
      verdict: s.verdict,
      timeMs: s.timeMs,
      memoryKb: s.memoryKb,
      compileOutput: canSeeCode ? s.compileOutput : null,
      tests: (s.testResults as TestResult[] | null) ?? [],
      createdAt: s.createdAt.toISOString(),
      judgedAt: s.judgedAt?.toISOString() ?? null,
    };
    return view;
  });
}
