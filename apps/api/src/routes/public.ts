// ওয়েবসাইটের জন্য পাবলিক endpoint।
// ফেজ ২-এ লগইন যোগ হলে সাবমিশনে userId বসবে আর অন্যের কোড লুকানো থাকবে।

import type { FastifyInstance } from "fastify";
import {
  LANGUAGES,
  MAX_SOURCE_BYTES,
  type Language,
  type ProblemView,
  type SubmissionView,
  type TestResult,
} from "@vibejudge/shared";
import { prisma } from "../db.js";
import { notifyWork } from "../queue.js";

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
      where: { slug: req.params.slug, visibility: "PUBLIC" },
      include: { tests: { where: { isSample: true }, orderBy: { ordinal: "asc" } } },
    });
    if (!problem) return reply.code(404).send({ error: "Problem not found" });

    const view: ProblemView = {
      id: problem.id,
      slug: problem.slug,
      title: problem.title,
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
      // লগইন আসার আগ পর্যন্ত IP প্রতি মিনিটে ১০টা
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
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
      const { problemSlug, language, source } = req.body;
      if (Buffer.byteLength(source) > MAX_SOURCE_BYTES) {
        return reply.code(413).send({ error: `Source code is larger than ${MAX_SOURCE_BYTES / 1024} KB` });
      }
      const problem = await prisma!.problem.findFirst({
        where: { slug: problemSlug, visibility: "PUBLIC" },
        select: { id: true },
      });
      if (!problem) return reply.code(404).send({ error: "Problem not found" });

      const submission = await prisma!.submission.create({
        data: { problemId: problem.id, language, source },
        select: { id: true },
      });
      notifyWork();
      return reply.code(201).send(submission);
    },
  );

  app.get<{ Params: { id: string } }>("/submissions/:id", async (req, reply) => {
    const s = await prisma!.submission.findUnique({
      where: { id: req.params.id },
      include: { problem: { select: { slug: true, title: true } } },
    });
    if (!s) return reply.code(404).send({ error: "Submission not found" });

    const view: SubmissionView = {
      id: s.id,
      problem: s.problem,
      language: s.language,
      source: s.source,
      verdict: s.verdict,
      timeMs: s.timeMs,
      memoryKb: s.memoryKb,
      compileOutput: s.compileOutput,
      tests: (s.testResults as TestResult[] | null) ?? [],
      createdAt: s.createdAt.toISOString(),
      judgedAt: s.judgedAt?.toISOString() ?? null,
    };
    return view;
  });
}
