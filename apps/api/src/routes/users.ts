import type { FastifyInstance } from "fastify";
import { DISPLAY_TIME_ZONE, PASSWORD_MIN_LENGTH, type ActivityDay, type ProfileUpdate, type UserProfile } from "@vibejudge/shared";
import { prisma } from "../db.js";
import { requireUser } from "../auth/guards.js";
import { getSessionUser, invalidateUserSessions, revokeSessions, toAuthUser } from "../auth/session.js";
import { generatePassword, hashPassword, verifyPassword } from "../auth/password.js";
import { toSummary } from "./contests.js";

const CONTEST_INCLUDE = {
  problems: { include: { problem: { select: { id: true, slug: true, title: true } } } },
  author: { select: { username: true } },
  _count: { select: { participants: { where: { virtual: false } } } },
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

    const [solvedProblems, submissions, accepted, authored, participated, activity, teams] = await Promise.all([
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
        where: { participants: { some: { userId: user.id, virtual: false } }, ...contestFilter },
        orderBy: { startsAt: "desc" },
        take: 100,
        include: CONTEST_INCLUDE,
      }),
      // Heatmap: বাংলাদেশ সময়ে দিন ধরে (রাত ১২টার পরের সাবমিশন যেন আগের দিনে না পড়ে)।
      // createdAt UTC-তে জমা থাকে (time zone ছাড়া), তাই আগে UTC বলে দিয়ে তারপর ঢাকার সময়ে নিই।
      prisma!.$queryRaw<ActivityDay[]>`
        SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${DISPLAY_TIME_ZONE}, 'YYYY-MM-DD') AS "date",
               count(*)::int AS "submissions",
               (count(*) FILTER (WHERE "verdict" = 'AC'))::int AS "accepted"
        FROM "submissions"
        WHERE "userId" = ${user.id} AND "createdAt" >= now() - interval '372 days'
        GROUP BY 1 ORDER BY 1`,
      prisma!.team.findMany({
        where: { members: { some: { userId: user.id, accepted: true } } },
        orderBy: { createdAt: "asc" },
        select: { slug: true, name: true },
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
      teams,
      isMe,
      hasPassword: seeAll ? user.passwordHash !== null : null,
      activity,
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

  // নিজের পাসওয়ার্ড বদলানো। শুধু Google অ্যাকাউন্টে (আগে পাসওয়ার্ড নেই) পুরোনোটা লাগে না।
  app.post<{ Body: { current?: string; next: string } }>(
    "/users/me/password",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        body: {
          type: "object",
          required: ["next"],
          properties: {
            current: { type: "string", maxLength: 200 },
            next: { type: "string", minLength: PASSWORD_MIN_LENGTH, maxLength: 200 },
          },
        },
      },
    },
    async (req, reply) => {
      const me = await requireUser(req, reply);
      if (!me) return reply;
      const user = await prisma!.user.findUniqueOrThrow({ where: { id: me.id }, select: { passwordHash: true } });
      if (user.passwordHash && !(await verifyPassword(req.body.current ?? "", user.passwordHash))) {
        return reply.code(403).send({ error: "Current password is wrong" });
      }
      await prisma!.user.update({ where: { id: me.id }, data: { passwordHash: await hashPassword(req.body.next) } });
      // অন্য ডিভাইসের লগইন বাতিল — পুরোনো পাসওয়ার্ড জানা কেউ যেন থেকে না যায়
      const revoked = await revokeSessions(me.id, req);
      return { ok: true, otherSessionsRevoked: revoked };
    },
  );

  // Admin: ছাত্র পাসওয়ার্ড হারালে নতুন random পাসওয়ার্ড (একবারই দেখায়), সব লগইন বাতিল
  app.post<{ Params: { username: string } }>("/admin/users/:username/reset-password", async (req, reply) => {
    const admin = await requireUser(req, reply, ["ADMIN"]);
    if (!admin) return reply;
    const user = await prisma!.user.findUnique({ where: { username: req.params.username.toLowerCase() } });
    if (!user) return reply.code(404).send({ error: "User not found" });
    const password = generatePassword();
    // random পাসওয়ার্ড — হালকা hash যথেষ্ট (বাল্ক অ্যাকাউন্টের মতো)
    await prisma!.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password, "light") } });
    await revokeSessions(user.id);
    req.log.info({ admin: admin.username, user: user.username }, "password reset by admin");
    return { username: user.username, password };
  });
}
