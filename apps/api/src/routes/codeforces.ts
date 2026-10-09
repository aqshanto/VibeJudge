// Codeforces: handle যাচাই, author-এর প্রবলেম যোগ করা, আর "Check my Codeforces submissions"।

import type { FastifyInstance } from "fastify";
import type { CodeforcesVerify } from "@vibejudge/shared";
import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../db.js";
import { requireUser } from "../auth/guards.js";
import { loadContestCached } from "../contest-access.js";
import {
  CodeforcesError,
  cfApi,
  codeforcesKey,
  codeforcesUrl,
  findCodeforcesProblem,
  markChecked,
  parseCodeforcesRef,
  syncCodeforcesUser,
} from "../codeforces.js";

/** সহজ প্রবলেম — এখানে ইচ্ছা করে compile error জমা দিয়ে handle-এর মালিকানা প্রমাণ */
const VERIFY_PROBLEMS = ["4A", "1A", "71A", "231A", "158A", "50A", "282A", "263A"];
const VERIFY_MINUTES = 10;
/** "Check now" একজন এর চেয়ে ঘনঘন না (Codeforces-এর সীমা সবার জন্য একটাই) */
const MANUAL_SYNC_GAP_MS = 30_000;
const lastManualSync = new Map<string, number>();

export function verifyView(u: {
  cfVerifyHandle: string | null;
  cfVerifyProblem: string | null;
  cfVerifyStartedAt: Date | null;
}): CodeforcesVerify | null {
  if (!u.cfVerifyHandle || !u.cfVerifyProblem || !u.cfVerifyStartedAt) return null;
  const expiresAt = u.cfVerifyStartedAt.getTime() + VERIFY_MINUTES * 60_000;
  if (Date.now() > expiresAt) return null;
  const ref = parseCodeforcesRef(u.cfVerifyProblem)!;
  return {
    handle: u.cfVerifyHandle,
    problem: u.cfVerifyProblem,
    url: codeforcesUrl(ref),
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

const cfError = (err: unknown) => (err instanceof CodeforcesError ? err.message : null);

export async function codeforcesRoutes(app: FastifyInstance) {
  // ১) handle দিলে: Codeforces-এ আছে কি না দেখে একটা প্রবলেম দিই
  app.post<{ Body: { handle: string } }>(
    "/me/codeforces/start",
    {
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
      schema: {
        body: {
          type: "object",
          required: ["handle"],
          properties: { handle: { type: "string", minLength: 3, maxLength: 24, pattern: "^[A-Za-z0-9_.\\-]+$" } },
        },
      },
    },
    async (req, reply) => {
      const user = await requireUser(req, reply);
      if (!user) return reply;
      let handle: string;
      try {
        const info = await cfApi<{ handle: string }[]>("user.info", { handles: req.body.handle });
        handle = info[0]!.handle; // Codeforces যেমন লেখে (বড়/ছোট হাত)
      } catch (err) {
        const msg = cfError(err);
        if (msg?.includes("not found")) return reply.code(404).send({ error: "No Codeforces user with this handle" });
        if (msg) return reply.code(502).send({ error: msg });
        throw err;
      }
      const owner = await prisma!.user.findUnique({ where: { cfHandle: handle }, select: { id: true } });
      if (owner && owner.id !== user.id) return reply.code(409).send({ error: "This handle is already linked to another account" });

      const problem = VERIFY_PROBLEMS[Math.floor(Math.random() * VERIFY_PROBLEMS.length)]!;
      const saved = await prisma!.user.update({
        where: { id: user.id },
        data: { cfVerifyHandle: handle, cfVerifyProblem: problem, cfVerifyStartedAt: new Date() },
        select: { cfVerifyHandle: true, cfVerifyProblem: true, cfVerifyStartedAt: true },
      });
      return verifyView(saved);
    },
  );

  // ২) "Check": নির্দিষ্ট প্রবলেমে সময়ের মধ্যে compile error পেলে handle যুক্ত
  app.post("/me/codeforces/check", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return reply;
    const row = await prisma!.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { cfVerifyHandle: true, cfVerifyProblem: true, cfVerifyStartedAt: true },
    });
    const pending = verifyView(row);
    if (!pending) return reply.code(409).send({ error: "The verification expired — start again" });

    let subs: { creationTimeSeconds: number; verdict?: string; problem: { contestId?: number; index: string } }[];
    try {
      subs = await cfApi("user.status", { handle: pending.handle, from: 1, count: 10 });
    } catch (err) {
      const msg = cfError(err);
      if (msg) return reply.code(502).send({ error: msg });
      throw err;
    }
    const since = row.cfVerifyStartedAt!.getTime() / 1000 - 60;
    const ok = subs.some(
      (s) =>
        s.creationTimeSeconds >= since &&
        s.verdict === "COMPILATION_ERROR" &&
        `${s.problem.contestId}${s.problem.index}` === pending.problem,
    );
    if (!ok) {
      return reply.code(409).send({
        error: `No compilation error on ${pending.problem} from ${pending.handle} yet. If you just submitted, wait a few seconds and check again.`,
      });
    }
    try {
      await prisma!.user.update({
        where: { id: user.id },
        data: { cfHandle: pending.handle, cfVerifyHandle: null, cfVerifyProblem: null, cfVerifyStartedAt: null },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return reply.code(409).send({ error: "This handle is already linked to another account" });
      }
      throw err;
    }
    return { cfHandle: pending.handle };
  });

  app.delete("/me/codeforces", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return reply;
    await prisma!.user.update({
      where: { id: user.id },
      data: { cfHandle: null, cfVerifyHandle: null, cfVerifyProblem: null, cfVerifyStartedAt: null },
    });
    return { ok: true };
  });

  // Author: Codeforces-এর প্রবলেম কনটেস্টে দেওয়ার জন্য (একই প্রবলেম একবারই তৈরি হয়, সবাই ব্যবহার করে)
  app.post<{ Body: { ref: string } }>(
    "/author/problems/codeforces",
    {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      schema: {
        body: { type: "object", required: ["ref"], properties: { ref: { type: "string", minLength: 2, maxLength: 200 } } },
      },
    },
    async (req, reply) => {
      const user = await requireUser(req, reply, ["AUTHOR", "ADMIN"]);
      if (!user) return reply;
      const ref = parseCodeforcesRef(req.body.ref);
      if (!ref) return reply.code(400).send({ error: 'Write it like "1850A" or paste the problem link' });
      const key = codeforcesKey(ref);
      const existing = await prisma!.problem.findUnique({
        where: { source_remoteId: { source: "CODEFORCES", remoteId: key } },
        select: { slug: true, title: true },
      });
      if (existing) return { ...existing, ref: key };

      let name: string | null;
      try {
        name = await findCodeforcesProblem(ref);
      } catch (err) {
        const msg = cfError(err);
        if (msg) return reply.code(502).send({ error: msg });
        throw err;
      }
      if (!name) return reply.code(404).send({ error: `Codeforces problem ${key} not found (gym problems aren't supported)` });
      try {
        const p = await prisma!.problem.create({
          data: {
            slug: `cf-${key.toLowerCase()}`,
            title: name,
            statement: "",
            source: "CODEFORCES",
            remoteId: key,
            // archive-এ দেখায় না; কনটেস্টে যোগ করা যায় (যেকোনো author)
            visibility: "CONTEST",
            authorId: user.id,
          },
          select: { slug: true, title: true },
        });
        return reply.code(201).send({ ...p, ref: key });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          const p = await prisma!.problem.findUniqueOrThrow({
            where: { source_remoteId: { source: "CODEFORCES", remoteId: key } },
            select: { slug: true, title: true },
          });
          return { ...p, ref: key };
        }
        throw err;
      }
    },
  );

  // প্রতিযোগীর "Check my Codeforces submissions" — পালার জন্য অপেক্ষা না করে এখনই
  app.post<{ Params: { slug: string } }>("/contests/:slug/codeforces/sync", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return reply;
    const contest = await loadContestCached(req.params.slug);
    if (!contest) return reply.code(404).send({ error: "Contest not found" });
    const me = await prisma!.user.findUniqueOrThrow({ where: { id: user.id }, select: { cfHandle: true } });
    if (!me.cfHandle) return reply.code(409).send({ error: "Link your Codeforces handle on your profile first" });
    const wait = (lastManualSync.get(user.id) ?? 0) + MANUAL_SYNC_GAP_MS - Date.now();
    if (wait > 0) return reply.code(429).send({ error: `Checked just now — try again in ${Math.ceil(wait / 1000)} s` });
    lastManualSync.set(user.id, Date.now());
    markChecked(user.id);
    try {
      const changed = await syncCodeforcesUser(user.id, me.cfHandle, 50);
      return { changed };
    } catch (err) {
      const msg = cfError(err);
      if (msg) return reply.code(502).send({ error: msg });
      throw err;
    }
  });
}
