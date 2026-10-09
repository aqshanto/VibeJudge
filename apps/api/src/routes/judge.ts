// Judge worker-দের জন্য endpoint — সব request-এ "Authorization: Bearer <JUDGE_TOKEN>" লাগে।

import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { VERDICTS, type JudgeProgressReport, type JudgeReport, type ProblemData } from "@vibejudge/shared";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { claimJob, clearProgress, setProgress } from "../queue.js";

const FINAL_VERDICTS = VERDICTS.filter((v) => v !== "PENDING" && v !== "JUDGING");
const MAX_WAIT_MS = 25_000;

function tokenMatches(header: string | undefined): boolean {
  if (!env.judgeToken || !header?.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice(7));
  const expected = Buffer.from(env.judgeToken);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function judgeRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (req, reply) => {
    if (!env.judgeToken) return reply.code(503).send({ error: "Judging is disabled (JUDGE_TOKEN not set)" });
    if (!tokenMatches(req.headers.authorization)) return reply.code(401).send({ error: "Invalid judge token" });
  });

  // কাজ থাকলে 200 + JudgeJob, না থাকলে (wait পর্যন্ত অপেক্ষার পর) 204
  app.post<{ Querystring: { wait?: number }; Body: { worker: string } }>(
    "/claim",
    {
      schema: {
        querystring: { type: "object", properties: { wait: { type: "integer", minimum: 0 } } },
        body: {
          type: "object",
          required: ["worker"],
          properties: { worker: { type: "string", minLength: 1, maxLength: 100 } },
        },
      },
    },
    async (req, reply) => {
      const controller = new AbortController();
      req.raw.on("close", () => controller.abort());
      const waitMs = Math.min(req.query.wait ?? MAX_WAIT_MS, MAX_WAIT_MS);

      const job = await claimJob(req.body.worker, waitMs, controller.signal);
      if (!job) return reply.code(204).send();
      req.log.info({ submissionId: job.submissionId, worker: req.body.worker }, "submission claimed");
      return job;
    },
  );

  app.get<{ Params: { id: string } }>("/problems/:id/data", async (req, reply) => {
    const problem = await prisma!.problem.findUnique({
      where: { id: req.params.id },
      select: {
        dataVersion: true,
        checkerSource: true,
        tests: { orderBy: { ordinal: "asc" }, select: { ordinal: true, input: true, answer: true } },
      },
    });
    if (!problem) return reply.code(404).send({ error: "Problem not found" });

    const data: ProblemData = {
      dataVersion: problem.dataVersion,
      checkerSource: problem.checkerSource,
      tests: problem.tests.map((t) => ({
        name: String(t.ordinal),
        input: Buffer.from(t.input).toString("base64"),
        answer: Buffer.from(t.answer).toString("base64"),
      })),
    };
    return data;
  });

  // judge চলাকালীন অগ্রগতি — memory-তে রাখি, DB ছুঁই না (worker সেকেন্ডে একবারের বেশি পাঠায় না)
  app.post<{ Params: { id: string }; Body: JudgeProgressReport }>(
    "/submissions/:id/progress",
    {
      schema: {
        body: {
          type: "object",
          required: ["claimToken", "phase", "done", "total"],
          properties: {
            claimToken: { type: "string", maxLength: 100 },
            phase: { type: "string", enum: ["compiling", "running"] },
            done: { type: "integer", minimum: 0, maximum: 10_000 },
            total: { type: "integer", minimum: 0, maximum: 10_000 },
          },
        },
      },
    },
    async (req, reply) => {
      const { claimToken, phase, done, total } = req.body;
      // টোকেন না মিললেও (যেমন API restart হয়েছে) চুপচাপ 204 — অগ্রগতি না দেখানো verdict-এর চেয়ে কম জরুরি
      setProgress(req.params.id, claimToken, { phase, done: Math.min(done, total), total });
      return reply.code(204).send();
    },
  );

  app.post<{ Params: { id: string }; Body: JudgeReport }>(
    "/submissions/:id/result",
    {
      schema: {
        body: {
          type: "object",
          required: ["claimToken", "verdict", "timeMs", "memoryKb", "tests"],
          properties: {
            claimToken: { type: "string" },
            verdict: { type: "string", enum: FINAL_VERDICTS },
            timeMs: { type: "integer", minimum: 0 },
            memoryKb: { type: "integer", minimum: 0 },
            compileOutput: { type: "string", maxLength: 16384 },
            tests: { type: "array", maxItems: 1000 },
          },
        },
      },
    },
    async (req, reply) => {
      const r = req.body;
      // IOI কনটেস্ট: নম্বর = পাস করা টেস্ট ÷ মোট টেস্ট × ১০০
      const sub = await prisma!.submission.findUnique({
        where: { id: req.params.id },
        select: { problemId: true, contest: { select: { scoring: true } } },
      });
      let score: number | null = null;
      if (sub?.contest?.scoring === "IOI") {
        const total = await prisma!.testCase.count({ where: { problemId: sub.problemId } });
        const passed = r.tests.filter((t) => t.verdict === "AC").length;
        score = r.verdict === "AC" ? 100 : total > 0 ? Math.floor((100 * passed) / total) : 0;
      }
      // শুধু যে worker claim করেছে সে-ই লিখতে পারবে, আর শুধু একবার
      const updated = await prisma!.submission.updateMany({
        where: { id: req.params.id, claimToken: r.claimToken, verdict: "JUDGING" },
        data: {
          verdict: r.verdict,
          timeMs: r.timeMs,
          memoryKb: r.memoryKb,
          compileOutput: r.compileOutput ?? null,
          testResults: r.tests as object[],
          score,
          claimToken: null,
          judgedAt: new Date(),
        },
      });
      clearProgress(req.params.id);
      if (updated.count === 0) return reply.code(409).send({ error: "Submission is not claimed by this token" });
      req.log.info({ submissionId: req.params.id, verdict: r.verdict }, "submission judged");
      return { ok: true };
    },
  );
}
