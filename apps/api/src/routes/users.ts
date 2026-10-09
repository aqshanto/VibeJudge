import type { FastifyInstance } from "fastify";
import type { ProfileUpdate, UserProfile } from "@vibejudge/shared";
import { prisma } from "../db.js";
import { requireUser } from "../auth/guards.js";
import { getSessionUser, invalidateUserSessions, toAuthUser } from "../auth/session.js";
import { toSummary } from "./contests.js";

const CONTEST_INCLUDE = {
  problems: { include: { problem: { select: { id: true, slug: true, title: true } } } },
  author: { select: { username: true } },
  _count: { select: { participants: true } },
} as const;

export async function userRoutes(app: FastifyInstance) {
  app.get<{ Params: { username: string } }>("/users/:username", async (req, reply) => {
    const user = await prisma!.user.findUnique({ where: { username: req.params.username.toLowerCase() } });
    if (!user) return reply.code(404).send({ error: "User not found" });
    const viewer = await getSessionUser(req);
    const isMe = viewer?.id === user.id;
    // Private কনটেস্ট শুধু নিজে (আর admin) দেখে
    const seeAll = isMe || viewer?.role === "ADMIN";
    const contestFilter = seeAll ? {} : { isPublic: true };

    const [solvedProblems, submissions, accepted, authored, participated] = await Promise.all([
      // শুধু Public প্রবলেম — Contest/Private প্রবলেমের নাম ফাঁস হবে না
      prisma!.$queryRaw<{ slug: string; title: string }[]>`
        SELECT DISTINCT p."slug", p."title"
        FROM "submissions" s JOIN "problems" p ON p."id" = s."problemId"
        WHERE s."userId" = ${user.id} AND s."verdict" = 'AC' AND p."visibility" = 'PUBLIC'
        ORDER BY p."title"`,
      prisma!.submission.count({ where: { userId: user.id } }),
      prisma!.submission.count({ where: { userId: user.id, verdict: "AC" } }),
      prisma!.contest.findMany({
        where: { authorId: user.id, ...contestFilter },
        orderBy: { startsAt: "desc" },
        take: 100,
        include: CONTEST_INCLUDE,
      }),
      prisma!.contest.findMany({
        where: { participants: { some: { userId: user.id } }, ...contestFilter },
        orderBy: { startsAt: "desc" },
        take: 100,
        include: CONTEST_INCLUDE,
      }),
    ]);

    const profile: UserProfile = {
      username: user.username,
      displayName: user.displayName,
      institution: user.institution,
      batch: user.batch,
      section: user.section,
      role: user.role,
      joinedAt: user.createdAt.toISOString(),
      stats: { solved: solvedProblems.length, submissions, accepted },
      solvedProblems,
      authoredContests: authored.map(toSummary),
      participatedContests: participated.map(toSummary),
      isMe,
    };
    return profile;
  });

  app.patch<{ Body: ProfileUpdate }>(
    "/users/me",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            displayName: { type: "string", maxLength: 60 },
            institution: { type: "string", maxLength: 100 },
            batch: { type: "string", maxLength: 30 },
            section: { type: "string", maxLength: 30 },
          },
        },
      },
    },
    async (req, reply) => {
      const me = await requireUser(req, reply);
      if (!me) return reply;
      // খালি লেখা = মুছে ফেলা
      const clean = (v: string | undefined) => (v === undefined ? undefined : v.trim() || null);
      const updated = await prisma!.user.update({
        where: { id: me.id },
        data: {
          displayName: clean(req.body.displayName),
          institution: clean(req.body.institution),
          batch: clean(req.body.batch),
          section: clean(req.body.section),
        },
      });
      invalidateUserSessions(me.id);
      return { user: toAuthUser(updated) };
    },
  );
}
