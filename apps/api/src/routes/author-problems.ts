// Author-দের প্রবলেম বানানো/এডিট। Author শুধু নিজের প্রবলেম দেখে, Admin সবার।

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  LIMITS,
  MAX_PROBLEM_TESTS_BYTES,
  MAX_TEST_FILE_BYTES,
  MAX_TESTS_PER_PROBLEM,
  SLUG_PATTERN,
  VISIBILITIES,
  type AuthorProblemDetail,
  type AuthorProblemSummary,
  type ProblemUpdate,
  type TestMeta,
  type TestUpload,
} from "@vibejudge/shared";
import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../db.js";
import { requireUser } from "../auth/guards.js";

const SLUG_RE = new RegExp(SLUG_PATTERN);
const PREVIEW_BYTES = 200;

/** প্রবলেমটা এই ইউজার এডিট করতে পারবে কি না; না পারলে 404 (অন্যের প্রবলেম আছে কি না সেটাও জানাই না) */
async function loadEditable(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const user = await requireUser(req, reply, ["AUTHOR", "ADMIN"]);
  if (!user) return null;
  const problem = await prisma!.problem.findUnique({ where: { id: req.params.id } });
  if (!problem || (user.role !== "ADMIN" && problem.authorId !== user.id)) {
    reply.code(404).send({ error: "Problem not found" });
    return null;
  }
  return { user, problem };
}

async function testMetas(problemId: string): Promise<TestMeta[]> {
  // পুরো bytes না এনে শুধু সাইজ আর শুরুর অংশ
  const rows = await prisma!.$queryRaw<
    { ordinal: number; isSample: boolean; inputBytes: number; answerBytes: number; inputHead: Uint8Array; answerHead: Uint8Array }[]
  >`
    SELECT "ordinal", "isSample",
           octet_length("input")::int AS "inputBytes", octet_length("answer")::int AS "answerBytes",
           substring("input" FROM 1 FOR ${PREVIEW_BYTES}) AS "inputHead",
           substring("answer" FROM 1 FOR ${PREVIEW_BYTES}) AS "answerHead"
    FROM "test_cases" WHERE "problemId" = ${problemId} ORDER BY "ordinal"`;
  return rows.map((r) => ({
    ordinal: r.ordinal,
    isSample: r.isSample,
    inputBytes: r.inputBytes,
    answerBytes: r.answerBytes,
    inputPreview: Buffer.from(r.inputHead).toString("utf8"),
    answerPreview: Buffer.from(r.answerHead).toString("utf8"),
  }));
}

async function detail(problemId: string): Promise<AuthorProblemDetail> {
  const p = await prisma!.problem.findUniqueOrThrow({ where: { id: problemId } });
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    statement: p.statement,
    timeLimitMs: p.timeLimitMs,
    memoryLimitKb: p.memoryLimitKb,
    visibility: p.visibility,
    checkerSource: p.checkerSource,
    dataVersion: p.dataVersion,
    tests: await testMetas(p.id),
    updatedAt: p.updatedAt.toISOString(),
  };
}

const isUniqueViolation = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

const ID_PARAMS = { type: "object", required: ["id"], properties: { id: { type: "string" } } } as const;

export async function authorProblemRoutes(app: FastifyInstance) {
  app.get("/problems", async (req, reply) => {
    const user = await requireUser(req, reply, ["AUTHOR", "ADMIN"]);
    if (!user) return reply;
    const rows = await prisma!.problem.findMany({
      where: user.role === "ADMIN" ? {} : { authorId: user.id },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { tests: true } }, author: { select: { username: true } } },
    });
    const list: AuthorProblemSummary[] = rows.map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      visibility: p.visibility,
      testCount: p._count.tests,
      author: p.author?.username ?? null,
      updatedAt: p.updatedAt.toISOString(),
    }));
    return { problems: list };
  });

  app.post<{ Body: { title: string; slug: string } }>(
    "/problems",
    {
      schema: {
        body: {
          type: "object",
          required: ["title", "slug"],
          properties: { title: { type: "string", minLength: 1, maxLength: 100 }, slug: { type: "string" } },
        },
      },
    },
    async (req, reply) => {
      const user = await requireUser(req, reply, ["AUTHOR", "ADMIN"]);
      if (!user) return reply;
      const slug = req.body.slug.trim().toLowerCase();
      if (!SLUG_RE.test(slug)) {
        return reply.code(400).send({ error: "Short name must be 3–40 characters: a-z, 0-9 and -" });
      }
      try {
        const p = await prisma!.problem.create({
          data: { slug, title: req.body.title.trim(), statement: "", authorId: user.id, visibility: "PRIVATE" },
          select: { id: true },
        });
        return reply.code(201).send(p);
      } catch (err) {
        if (isUniqueViolation(err)) return reply.code(409).send({ error: "This short name is already used" });
        throw err;
      }
    },
  );

  app.get<{ Params: { id: string } }>("/problems/:id", { schema: { params: ID_PARAMS } }, async (req, reply) => {
    const ctx = await loadEditable(req, reply);
    if (!ctx) return reply;
    return detail(ctx.problem.id);
  });

  app.patch<{ Params: { id: string }; Body: ProblemUpdate }>(
    "/problems/:id",
    {
      schema: {
        params: ID_PARAMS,
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            slug: { type: "string" },
            title: { type: "string", minLength: 1, maxLength: 100 },
            statement: { type: "string", maxLength: 100_000 },
            timeLimitMs: { type: "integer", minimum: LIMITS.timeMs.min, maximum: LIMITS.timeMs.max },
            memoryLimitKb: { type: "integer", minimum: LIMITS.memoryKb.min, maximum: LIMITS.memoryKb.max },
            visibility: { type: "string", enum: [...VISIBILITIES] },
            checkerSource: { type: ["string", "null"], maxLength: 200_000 },
          },
        },
      },
    },
    async (req, reply) => {
      const ctx = await loadEditable(req, reply);
      if (!ctx) return reply;
      const b = req.body;
      const data: Prisma.ProblemUpdateInput = {};

      if (b.slug !== undefined) {
        const slug = b.slug.trim().toLowerCase();
        if (!SLUG_RE.test(slug)) {
          return reply.code(400).send({ error: "Short name must be 3–40 characters: a-z, 0-9 and -" });
        }
        data.slug = slug;
      }
      if (b.title !== undefined) data.title = b.title.trim();
      if (b.statement !== undefined) data.statement = b.statement;
      if (b.timeLimitMs !== undefined) data.timeLimitMs = b.timeLimitMs;
      if (b.memoryLimitKb !== undefined) data.memoryLimitKb = b.memoryLimitKb;
      if (b.visibility !== undefined) {
        // টেস্ট ছাড়া Public করলে যেকোনো সাবমিশন পাস হয়ে যেত
        if (b.visibility === "PUBLIC") {
          const tests = await prisma!.testCase.count({ where: { problemId: ctx.problem.id } });
          if (tests === 0) return reply.code(400).send({ error: "Upload tests before making the problem public" });
        }
        data.visibility = b.visibility;
      }
      if (b.checkerSource !== undefined) {
        const source = b.checkerSource?.trim() ? b.checkerSource : null;
        if (source !== ctx.problem.checkerSource) {
          data.checkerSource = source;
          // worker-এর cache-এ পুরোনো checker আছে — নতুন করে compile করাতে হবে
          data.dataVersion = { increment: 1 };
        }
      }

      try {
        await prisma!.problem.update({ where: { id: ctx.problem.id }, data });
      } catch (err) {
        if (isUniqueViolation(err)) return reply.code(409).send({ error: "This short name is already used" });
        throw err;
      }
      return detail(ctx.problem.id);
    },
  );

  // টেস্ট আপলোড: "replace" সব পুরোনো মুছে নতুন বসায়, "append" শেষে যোগ করে।
  // বড় সেট ব্রাউজার কয়েক ভাগে পাঠায় (প্রথমটা replace, বাকিগুলো append)।
  app.post<{ Params: { id: string }; Body: TestUpload }>(
    "/problems/:id/tests",
    {
      bodyLimit: 8 * 1024 * 1024,
      schema: {
        params: ID_PARAMS,
        body: {
          type: "object",
          required: ["mode", "tests"],
          properties: {
            mode: { type: "string", enum: ["replace", "append"] },
            tests: {
              type: "array",
              maxItems: MAX_TESTS_PER_PROBLEM,
              items: {
                type: "object",
                required: ["input", "answer", "isSample"],
                properties: { input: { type: "string" }, answer: { type: "string" }, isSample: { type: "boolean" } },
              },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const ctx = await loadEditable(req, reply);
      if (!ctx) return reply;
      const problemId = ctx.problem.id;

      const decoded = req.body.tests.map((t) => ({
        input: Buffer.from(t.input, "base64"),
        answer: Buffer.from(t.answer, "base64"),
        isSample: t.isSample,
      }));
      const tooBig = decoded.findIndex(
        (t) => t.input.length > MAX_TEST_FILE_BYTES || t.answer.length > MAX_TEST_FILE_BYTES,
      );
      if (tooBig >= 0) {
        return reply
          .code(413)
          .send({ error: `Test #${tooBig + 1} is larger than ${MAX_TEST_FILE_BYTES / 1024 / 1024} MB` });
      }

      const [existing] = await prisma!.$queryRaw<{ count: number; bytes: number; maxOrdinal: number }[]>`
        SELECT count(*)::int AS "count",
               coalesce(sum(octet_length("input") + octet_length("answer")), 0)::bigint::float8 AS "bytes",
               coalesce(max("ordinal"), 0)::int AS "maxOrdinal"
        FROM "test_cases" WHERE "problemId" = ${problemId}`;
      const append = req.body.mode === "append";
      const newBytes = decoded.reduce((s, t) => s + t.input.length + t.answer.length, 0);
      const totalCount = (append ? existing!.count : 0) + decoded.length;
      const totalBytes = (append ? existing!.bytes : 0) + newBytes;
      if (totalCount > MAX_TESTS_PER_PROBLEM) {
        return reply.code(413).send({ error: `At most ${MAX_TESTS_PER_PROBLEM} tests per problem` });
      }
      if (totalBytes > MAX_PROBLEM_TESTS_BYTES) {
        return reply
          .code(413)
          .send({ error: `All tests together must be under ${MAX_PROBLEM_TESTS_BYTES / 1024 / 1024} MB` });
      }

      const start = append ? existing!.maxOrdinal : 0;
      await prisma!.$transaction(async (tx) => {
        if (!append) await tx.testCase.deleteMany({ where: { problemId } });
        await tx.testCase.createMany({
          data: decoded.map((t, i) => ({ problemId, ordinal: start + i + 1, ...t })),
        });
        await tx.problem.update({ where: { id: problemId }, data: { dataVersion: { increment: 1 } } });
      });
      return detail(problemId);
    },
  );

  app.patch<{ Params: { id: string; ordinal: number }; Body: { isSample: boolean } }>(
    "/problems/:id/tests/:ordinal",
    {
      schema: {
        params: {
          type: "object",
          required: ["id", "ordinal"],
          properties: { id: { type: "string" }, ordinal: { type: "integer", minimum: 1 } },
        },
        body: { type: "object", required: ["isSample"], properties: { isSample: { type: "boolean" } } },
      },
    },
    async (req, reply) => {
      const ctx = await loadEditable(req, reply);
      if (!ctx) return reply;
      // sample শুধু স্টেটমেন্টে দেখানোর জন্য — judge-এ প্রভাব নেই, তাই dataVersion বাড়াই না
      const res = await prisma!.testCase.updateMany({
        where: { problemId: ctx.problem.id, ordinal: req.params.ordinal },
        data: { isSample: req.body.isSample },
      });
      if (res.count === 0) return reply.code(404).send({ error: "Test not found" });
      return detail(ctx.problem.id);
    },
  );

  app.delete<{ Params: { id: string; ordinal: number } }>(
    "/problems/:id/tests/:ordinal",
    {
      schema: {
        params: {
          type: "object",
          required: ["id", "ordinal"],
          properties: { id: { type: "string" }, ordinal: { type: "integer", minimum: 1 } },
        },
      },
    },
    async (req, reply) => {
      const ctx = await loadEditable(req, reply);
      if (!ctx) return reply;
      const problemId = ctx.problem.id;
      const ordinal = req.params.ordinal;

      const deleted = await prisma!.$transaction(async (tx) => {
        const res = await tx.testCase.deleteMany({ where: { problemId, ordinal } });
        if (res.count === 0) return false;
        // পরের টেস্টগুলোর নম্বর এক ঘর কমাই (দুই ধাপে, যাতে unique constraint-এ ধাক্কা না লাগে)
        await tx.$executeRaw`UPDATE "test_cases" SET "ordinal" = -"ordinal" WHERE "problemId" = ${problemId} AND "ordinal" > ${ordinal}`;
        await tx.$executeRaw`UPDATE "test_cases" SET "ordinal" = -"ordinal" - 1 WHERE "problemId" = ${problemId} AND "ordinal" < 0`;
        await tx.problem.update({ where: { id: problemId }, data: { dataVersion: { increment: 1 } } });
        return true;
      });
      if (!deleted) return reply.code(404).send({ error: "Test not found" });
      return detail(problemId);
    },
  );
}
