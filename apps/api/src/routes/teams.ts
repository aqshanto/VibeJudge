// স্থায়ী টিম: একজন বানায় (OWNER), username দিয়ে invite করে, অন্যরা Accept করে।
// Team contest-এ যেকোনো সদস্য পুরো টিম রেজিস্টার করে (contests.ts)।

import type { FastifyInstance, FastifyReply } from "fastify";
import { TEAM_LIMITS, type AuthUser, type TeamView } from "@vibejudge/shared";
import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../db.js";
import { requireUser } from "../auth/guards.js";
import { getSessionUser } from "../auth/session.js";

/** একজন সর্বোচ্চ কয়টা টিমে থাকতে পারে (invite সহ) — অপব্যবহার ঠেকাতে */
const MAX_TEAMS_PER_USER = 20;

const TEAM_INCLUDE = {
  members: {
    orderBy: [{ role: "asc" }, { invitedAt: "asc" }],
    include: { user: { select: { id: true, username: true, displayName: true } } },
  },
  participations: { distinct: ["contestId"], select: { contest: { select: { slug: true, title: true } } } },
} as const satisfies Prisma.TeamInclude;

type LoadedTeam = Prisma.TeamGetPayload<{ include: typeof TEAM_INCLUDE }>;

/** "Team Rocket!" → "team-rocket" (বাংলা নাম হলে "team") */
function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
  return s.length >= 2 ? s : "team";
}

/** নাম তুলনার জন্য: বড়/ছোট হাত আর বাড়তি ফাঁকা বাদ */
const nameKeyOf = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

export function toTeamView(team: LoadedTeam, viewerId: string | null): TeamView {
  const mine = team.members.find((m) => m.userId === viewerId);
  return {
    slug: team.slug,
    name: team.name,
    createdAt: team.createdAt.toISOString(),
    // invite পাওয়া (এখনো Accept না করা) মানুষের নাম শুধু টিমের ভেতরের লোক দেখে
    members: team.members
      .filter((m) => m.accepted || mine)
      .map((m) => ({ username: m.user.username, displayName: m.user.displayName, role: m.role, accepted: m.accepted })),
    me: mine ? { role: mine.role, accepted: mine.accepted } : null,
    contests: team.participations.map((p) => p.contest),
  };
}

async function loadTeam(slug: string): Promise<LoadedTeam | null> {
  return prisma!.team.findUnique({ where: { slug }, include: TEAM_INCLUDE });
}

/** টিম আর দর্শকের সদস্যপদ; না পেলে/অনুমতি না থাকলে reply পাঠিয়ে null */
async function teamFor(
  slug: string,
  user: AuthUser,
  reply: FastifyReply,
  need: "member" | "owner" | "any",
): Promise<{ team: LoadedTeam; me: LoadedTeam["members"][number] | undefined } | null> {
  const team = await loadTeam(slug);
  if (!team) {
    reply.code(404).send({ error: "Team not found" });
    return null;
  }
  const me = team.members.find((m) => m.userId === user.id);
  if (need === "owner" && me?.role !== "OWNER") {
    reply.code(403).send({ error: "Only the team owner can do this" });
    return null;
  }
  if (need === "member" && !me) {
    reply.code(403).send({ error: "You are not in this team" });
    return null;
  }
  return { team, me };
}

const usernameBody = {
  body: {
    type: "object",
    required: ["username"],
    properties: { username: { type: "string", minLength: 1, maxLength: 40 } },
  },
} as const;

export async function teamRoutes(app: FastifyInstance) {
  // আমার টিম (Accept করা আর invite পাওয়া দুটোই)
  app.get("/teams/mine", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return reply;
    const teams = await prisma!.team.findMany({
      where: { members: { some: { userId: user.id } } },
      orderBy: { createdAt: "desc" },
      include: TEAM_INCLUDE,
    });
    return { teams: teams.map((t) => toTeamView(t, user.id)) };
  });

  app.post<{ Body: { name: string } }>(
    "/teams",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        body: {
          type: "object",
          required: ["name"],
          properties: { name: { type: "string", minLength: 1, maxLength: TEAM_LIMITS.nameMax } },
        },
      },
    },
    async (req, reply) => {
      const user = await requireUser(req, reply);
      if (!user) return reply;
      const name = req.body.name.trim().replace(/\s+/g, " ");
      if (name.length < 2) return reply.code(400).send({ error: "Team name must be at least 2 characters" });
      if ((await prisma!.teamMember.count({ where: { userId: user.id } })) >= MAX_TEAMS_PER_USER) {
        return reply.code(409).send({ error: `You can be in at most ${MAX_TEAMS_PER_USER} teams` });
      }
      if (await prisma!.team.findUnique({ where: { nameKey: nameKeyOf(name) }, select: { id: true } })) {
        return reply.code(409).send({ error: "A team with this name already exists" });
      }

      // URL: নাম থেকে; আগে থেকে থাকলে শেষে -2, -3 …
      const base = slugify(name);
      const taken = new Set(
        (await prisma!.team.findMany({ where: { slug: { startsWith: base } }, select: { slug: true } })).map((t) => t.slug),
      );
      let slug = base;
      for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;

      try {
        const team = await prisma!.team.create({
          data: {
            slug,
            name,
            nameKey: nameKeyOf(name),
            createdById: user.id,
            members: { create: { userId: user.id, role: "OWNER", accepted: true } },
          },
          include: TEAM_INCLUDE,
        });
        return reply.code(201).send(toTeamView(team, user.id));
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          return reply.code(409).send({ error: "A team with this name already exists — try again" });
        }
        throw err;
      }
    },
  );

  app.get<{ Params: { slug: string } }>("/teams/:slug", async (req, reply) => {
    const team = await loadTeam(req.params.slug);
    if (!team) return reply.code(404).send({ error: "Team not found" });
    const viewer = await getSessionUser(req);
    return toTeamView(team, viewer?.id ?? null);
  });

  app.post<{ Params: { slug: string }; Body: { username: string } }>(
    "/teams/:slug/invite",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } }, schema: usernameBody },
    async (req, reply) => {
      const user = await requireUser(req, reply);
      if (!user) return reply;
      const ctx = await teamFor(req.params.slug, user, reply, "owner");
      if (!ctx) return reply;
      const target = await prisma!.user.findUnique({
        where: { username: req.body.username.trim().toLowerCase() },
        select: { id: true, username: true },
      });
      if (!target) return reply.code(404).send({ error: "No user with this username" });
      if (ctx.team.members.some((m) => m.userId === target.id)) {
        return reply.code(409).send({ error: `${target.username} is already in the team (or invited)` });
      }
      if (ctx.team.members.length >= TEAM_LIMITS.maxMembers) {
        return reply.code(409).send({ error: `A team can have at most ${TEAM_LIMITS.maxMembers} members` });
      }
      if ((await prisma!.teamMember.count({ where: { userId: target.id } })) >= MAX_TEAMS_PER_USER) {
        return reply.code(409).send({ error: `${target.username} is already in too many teams` });
      }
      await prisma!.teamMember.create({ data: { teamId: ctx.team.id, userId: target.id } });
      return toTeamView((await loadTeam(ctx.team.slug))!, user.id);
    },
  );

  app.post<{ Params: { slug: string } }>("/teams/:slug/accept", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return reply;
    const ctx = await teamFor(req.params.slug, user, reply, "member");
    if (!ctx) return reply;
    await prisma!.teamMember.update({
      where: { teamId_userId: { teamId: ctx.team.id, userId: user.id } },
      data: { accepted: true },
    });
    return toTeamView((await loadTeam(ctx.team.slug))!, user.id);
  });

  // নিজে চলে যাওয়া (invite ফিরিয়ে দেওয়াও এটাই); owner চলে যেতে পারে না — টিম মুছতে হয়
  app.post<{ Params: { slug: string } }>("/teams/:slug/leave", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return reply;
    const ctx = await teamFor(req.params.slug, user, reply, "member");
    if (!ctx) return reply;
    if (ctx.me!.role === "OWNER") {
      return reply.code(409).send({ error: "The owner can't leave — delete the team instead" });
    }
    await prisma!.teamMember.delete({ where: { teamId_userId: { teamId: ctx.team.id, userId: user.id } } });
    return { ok: true };
  });

  app.post<{ Params: { slug: string }; Body: { username: string } }>(
    "/teams/:slug/remove",
    { schema: usernameBody },
    async (req, reply) => {
      const user = await requireUser(req, reply);
      if (!user) return reply;
      const ctx = await teamFor(req.params.slug, user, reply, "owner");
      if (!ctx) return reply;
      const member = ctx.team.members.find((m) => m.user.username === req.body.username.trim().toLowerCase());
      if (!member) return reply.code(404).send({ error: "Not a member of this team" });
      if (member.userId === user.id) return reply.code(409).send({ error: "You can't remove yourself" });
      // আগের কনটেস্টের রেজিস্ট্রেশন বদলায় না — শুধু পরের কনটেস্টে থাকবে না
      await prisma!.teamMember.delete({ where: { teamId_userId: { teamId: ctx.team.id, userId: member.userId } } });
      return toTeamView((await loadTeam(ctx.team.slug))!, user.id);
    },
  );

  app.delete<{ Params: { slug: string } }>("/teams/:slug", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return reply;
    const ctx = await teamFor(req.params.slug, user, reply, "owner");
    if (!ctx) return reply;
    // কনটেস্টের standings-এ টিমের নাম লাগে
    if (ctx.team.participations.length > 0) {
      return reply.code(409).send({ error: "This team took part in a contest, so it can't be deleted" });
    }
    await prisma!.team.delete({ where: { id: ctx.team.id } });
    return { ok: true };
  });
}
