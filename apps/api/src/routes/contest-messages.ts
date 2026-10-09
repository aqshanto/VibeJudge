// Clarification (প্রশ্ন-উত্তর) আর Announcement (ঘোষণা)।
//
// কনটেস্টের সময় ১০০০ জন প্রতি ৩০ সেকেন্ডে নতুন মেসেজ খোঁজে। তাই কনটেস্টের সব মেসেজ
// কয়েক সেকেন্ড memory-তে রাখি আর প্রত্যেক দর্শকের জন্য memory-তেই ছেঁকে দিই।

import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AuthUser, ClarificationView, ContestMessages } from "@vibejudge/shared";
import { prisma } from "../db.js";
import { requireUser } from "../auth/guards.js";
import { SESSION_COOKIE, getSessionUser } from "../auth/session.js";
import { contestAccess, loadContestCached, type LoadedContest } from "../contest-access.js";

const MESSAGES_TTL_MS = 5_000;

interface RawMessages {
  announcements: { id: string; message: string; createdAt: Date }[];
  clarifications: {
    id: string;
    userId: string;
    label: string | null;
    question: string;
    answer: string | null;
    isPublic: boolean;
    createdAt: Date;
    answeredAt: Date | null;
    user: { username: string };
  }[];
}

const cache = new Map<string, { at: number; value: Promise<RawMessages> }>();

function loadMessages(contestId: string): Promise<RawMessages> {
  const hit = cache.get(contestId);
  if (hit && Date.now() - hit.at < MESSAGES_TTL_MS) return hit.value;
  const value = Promise.all([
    prisma!.announcement.findMany({
      where: { contestId },
      orderBy: { createdAt: "desc" },
      select: { id: true, message: true, createdAt: true },
    }),
    prisma!.clarification.findMany({
      where: { contestId },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { username: true } } },
    }),
  ])
    .then(([announcements, clarifications]) => ({ announcements, clarifications }))
    .catch((err) => {
      cache.delete(contestId);
      throw err;
    });
  if (cache.size > 500) cache.clear();
  cache.set(contestId, { at: Date.now(), value });
  return value;
}

/** নতুন মেসেজ লেখার পর — সবাই যেন সাথে সাথে দেখে */
const invalidate = (contestId: string) => cache.delete(contestId);

function viewFor(raw: RawMessages, viewer: AuthUser | null, canManage: boolean): ContestMessages {
  const clarifications: ClarificationView[] = raw.clarifications
    // Manager সব দেখে; বাকিরা নিজের প্রশ্ন আর সবার জন্য দেওয়া উত্তর
    .filter((c) => canManage || c.userId === viewer?.id || (c.isPublic && c.answer !== null))
    .map((c) => {
      const mine = c.userId === viewer?.id;
      return {
        id: c.id,
        label: c.label,
        question: c.question,
        answer: c.answer,
        isPublic: c.isPublic,
        askedBy: canManage || mine ? c.user.username : null,
        mine,
        createdAt: c.createdAt.toISOString(),
        answeredAt: c.answeredAt?.toISOString() ?? null,
      };
    });
  return {
    announcements: raw.announcements.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
    clarifications,
  };
}

type SlugReq = FastifyRequest<{ Params: { slug: string } }>;

/** কনটেস্ট + অনুমতি; না থাকলে error পাঠিয়ে null */
async function load(req: SlugReq, reply: Parameters<typeof requireUser>[1], viewer: AuthUser | null) {
  const contest = await loadContestCached(req.params.slug);
  if (!contest) {
    reply.code(404).send({ error: "Contest not found" });
    return null;
  }
  const access = await contestAccess(contest, viewer);
  // Private কনটেস্টের মেসেজ শুধু প্রতিযোগী আর manager দেখে
  if (!contest.isPublic && !access.registered && !access.canManage) {
    reply.code(403).send({ error: "Only participants can see this contest's messages" });
    return null;
  }
  return { contest, access };
}

export async function contestMessageRoutes(app: FastifyInstance) {
  app.get<{ Params: { slug: string } }>("/contests/:slug/messages", async (req, reply) => {
    const viewer = await getSessionUser(req);
    const ctx = await load(req, reply, viewer);
    if (!ctx) return reply;
    reply.header("cache-control", "private, no-cache");
    return viewFor(await loadMessages(ctx.contest.id), viewer, ctx.access.canManage);
  });

  app.post<{ Params: { slug: string }; Body: { label?: string | null; question: string } }>(
    "/contests/:slug/clarifications",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "1 minute",
          keyGenerator: (req: FastifyRequest) => req.cookies[SESSION_COOKIE] ?? req.ip,
        },
      },
      schema: {
        body: {
          type: "object",
          required: ["question"],
          properties: {
            label: { type: ["string", "null"], maxLength: 2 },
            question: { type: "string", minLength: 3, maxLength: 2000 },
          },
        },
      },
    },
    async (req, reply) => {
      const user = await requireUser(req, reply);
      if (!user) return reply;
      const ctx = await load(req, reply, user);
      if (!ctx) return reply;
      if (!ctx.access.registered && !ctx.access.canManage) {
        return reply.code(403).send({ error: "Register for the contest to ask questions" });
      }
      if (ctx.access.phase !== "RUNNING") return reply.code(409).send({ error: "Questions can be asked only during the contest" });
      const label = req.body.label ? req.body.label.toUpperCase() : null;
      if (label && !ctx.contest.problems.some((p) => p.label === label)) {
        return reply.code(400).send({ error: "Unknown problem" });
      }

      await prisma!.clarification.create({
        data: { contestId: ctx.contest.id, userId: user.id, label, question: req.body.question.trim() },
      });
      invalidate(ctx.contest.id);
      return reply.code(201).send(viewFor(await loadMessages(ctx.contest.id), user, ctx.access.canManage));
    },
  );

  app.post<{ Params: { slug: string; id: string }; Body: { answer: string; isPublic: boolean } }>(
    "/contests/:slug/clarifications/:id/answer",
    {
      schema: {
        body: {
          type: "object",
          required: ["answer", "isPublic"],
          properties: { answer: { type: "string", minLength: 1, maxLength: 2000 }, isPublic: { type: "boolean" } },
        },
      },
    },
    async (req, reply) => {
      const user = await requireUser(req, reply);
      if (!user) return reply;
      const ctx = await managerOnly(req, reply, user);
      if (!ctx) return reply;
      const res = await prisma!.clarification.updateMany({
        where: { id: req.params.id, contestId: ctx.id },
        data: { answer: req.body.answer.trim(), isPublic: req.body.isPublic, answeredAt: new Date() },
      });
      if (res.count === 0) return reply.code(404).send({ error: "Question not found" });
      invalidate(ctx.id);
      return viewFor(await loadMessages(ctx.id), user, true);
    },
  );

  app.post<{ Params: { slug: string }; Body: { message: string } }>(
    "/contests/:slug/announcements",
    {
      schema: {
        body: { type: "object", required: ["message"], properties: { message: { type: "string", minLength: 1, maxLength: 2000 } } },
      },
    },
    async (req, reply) => {
      const user = await requireUser(req, reply);
      if (!user) return reply;
      const ctx = await managerOnly(req, reply, user);
      if (!ctx) return reply;
      await prisma!.announcement.create({ data: { contestId: ctx.id, message: req.body.message.trim() } });
      invalidate(ctx.id);
      return reply.code(201).send(viewFor(await loadMessages(ctx.id), user, true));
    },
  );
}

async function managerOnly(
  req: FastifyRequest<{ Params: { slug: string } }>,
  reply: Parameters<typeof requireUser>[1],
  user: AuthUser,
): Promise<LoadedContest | null> {
  const contest = await loadContestCached(req.params.slug);
  if (!contest) {
    reply.code(404).send({ error: "Contest not found" });
    return null;
  }
  if (user.role !== "ADMIN" && contest.authorId !== user.id) {
    reply.code(403).send({ error: "Only the contest author can do this" });
    return null;
  }
  return contest;
}
