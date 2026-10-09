import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  CONTEST_LIMITS,
  CONTEST_TYPES,
  LANGUAGES,
  LANGUAGE_INFO,
  MAX_SOURCE_BYTES,
  SLUG_PATTERN,
  TEAM_LIMITS,
  problemLabel,
  type ContestDetail,
  type ContestInput,
  type ContestProblemView,
  type ContestSummary,
  type Language,
} from "@vibejudge/shared";
import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../db.js";
import { requireUser } from "../auth/guards.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { SESSION_COOKIE, getSessionUser } from "../auth/session.js";
import {
  contestAccess,
  invalidateContest,
  loadContestCached,
  forgetParticipation,
  rememberParticipation,
  PARTICIPATION_SELECT,
  type ContestAccess,
  type LoadedContest,
} from "../contest-access.js";
import { notifyWork } from "../queue.js";
import { forgetTeammates } from "../teammates.js";
import { cachedStandings, computeStandings } from "../standings.js";

const SLUG_RE = new RegExp(SLUG_PATTERN);

const CONTEST_BODY = {
  type: "object",
  required: [
    "slug",
    "title",
    "description",
    "startsAt",
    "durationMinutes",
    "scoring",
    "penaltyMinutes",
    "freezeMinutes",
    "isPublic",
    "problemSlugs",
  ],
  additionalProperties: false,
  properties: {
    slug: { type: "string" },
    title: { type: "string", minLength: 1, maxLength: 120 },
    description: { type: "string", maxLength: 50_000 },
    startsAt: { type: "string", format: "date-time" },
    durationMinutes: {
      type: "integer",
      minimum: CONTEST_LIMITS.durationMinutes.min,
      maximum: CONTEST_LIMITS.durationMinutes.max,
    },
    scoring: { type: "string", enum: ["ICPC", "IOI"] },
    penaltyMinutes: {
      type: "integer",
      minimum: CONTEST_LIMITS.penaltyMinutes.min,
      maximum: CONTEST_LIMITS.penaltyMinutes.max,
    },
    freezeMinutes: { type: "integer", minimum: 0 },
    isPublic: { type: "boolean" },
    type: { type: "string", enum: [...CONTEST_TYPES] },
    windowMinutes: {
      type: "integer",
      minimum: CONTEST_LIMITS.durationMinutes.min,
      maximum: CONTEST_LIMITS.durationMinutes.max,
    },
    password: { type: "string", maxLength: 100 },
    teamSize: {
      type: ["integer", "null"],
      minimum: TEAM_LIMITS.contestSize.min,
      maximum: TEAM_LIMITS.contestSize.max,
    },
    // না পাঠালে: নতুন কনটেস্টে C/C++, এডিটে আগেরটাই
    languages: { type: "array", minItems: 1, uniqueItems: true, items: { type: "string", enum: [...LANGUAGES] } },
    problemSlugs: {
      type: "array",
      minItems: 1,
      maxItems: CONTEST_LIMITS.maxProblems,
      uniqueItems: true,
      items: { type: "string", maxLength: 100 },
    },
  },
} as const;

export function toSummary(c: LoadedContest): ContestSummary {
  return {
    id: c.id,
    slug: c.slug,
    title: c.title,
    type: c.type,
    startsAt: c.startsAt.toISOString(),
    endsAt: c.endsAt.toISOString(),
    durationMinutes: c.durationMinutes,
    scoring: c.scoring,
    isPublic: c.isPublic,
    author: c.author?.username ?? null,
    participantCount: c._count.participants,
    teamSize: c.teamSize,
  };
}

/** ইনপুট যাচাই + প্রবলেমের slug থেকে id; ভুল হলে error মেসেজ */
async function validateInput(
  input: ContestInput,
  user: { id: string; role: string },
): Promise<{ error: string } | { data: Omit<Prisma.ContestUncheckedCreateInput, "authorId">; problemIds: string[] }> {
  const slug = input.slug.trim().toLowerCase();
  if (!SLUG_RE.test(slug)) return { error: "Short name must be 3–40 characters: a-z, 0-9 and -" };
  if (input.freezeMinutes > input.durationMinutes) return { error: "Freeze can't be longer than the contest" };
  const type = input.type ?? "FIXED";
  if (type === "WINDOW" && (input.windowMinutes ?? 0) < input.durationMinutes) {
    return { error: "The window must be at least as long as each participant's time" };
  }

  // Author নিজের প্রবলেম বা Public প্রবলেম নিতে পারে; Admin যেকোনো
  const problems = await prisma!.problem.findMany({
    where: {
      slug: { in: input.problemSlugs },
      ...(user.role === "ADMIN" ? {} : { OR: [{ authorId: user.id }, { visibility: "PUBLIC" }] }),
    },
    select: { id: true, slug: true, _count: { select: { tests: true } } },
  });
  const bySlug = new Map(problems.map((p) => [p.slug, p]));
  const missing = input.problemSlugs.filter((s) => !bySlug.has(s));
  if (missing.length) return { error: `Problem not found or not yours: ${missing.join(", ")}` };
  const noTests = problems.filter((p) => p._count.tests === 0).map((p) => p.slug);
  if (noTests.length) return { error: `These problems have no tests yet: ${noTests.join(", ")}` };

  const startsAt = new Date(input.startsAt);
  const data = {
    slug,
    title: input.title.trim(),
    description: input.description,
    startsAt,
    durationMinutes: input.durationMinutes,
    type,
    // WINDOW: জানালা বন্ধের সময়; FIXED: শুরু + দৈর্ঘ্য
    endsAt: new Date(startsAt.getTime() + (type === "WINDOW" ? input.windowMinutes! : input.durationMinutes) * 60_000),
    scoring: input.scoring,
    penaltyMinutes: input.penaltyMinutes,
    // WINDOW-এ জানালা বন্ধ না হওয়া পর্যন্ত standings লুকানো থাকে — আলাদা freeze লাগে না
    freezeMinutes: type === "WINDOW" ? 0 : input.freezeMinutes,
    isPublic: input.isPublic,
    ...(input.teamSize !== undefined ? { teamSize: input.teamSize } : {}),
    ...(input.languages ? { languages: LANGUAGES.filter((l) => input.languages!.includes(l)) } : {}),
    ...(input.password === undefined
      ? {}
      : { passwordHash: input.password ? await hashPassword(input.password) : null }),
  };
  return { data, problemIds: input.problemSlugs.map((s) => bySlug.get(s)!.id) };
}

async function setProblems(tx: Prisma.TransactionClient, contestId: string, problemIds: string[]) {
  await tx.contestProblem.deleteMany({ where: { contestId } });
  await tx.contestProblem.createMany({
    data: problemIds.map((problemId, i) => ({ contestId, problemId, label: problemLabel(i) })),
  });
}

const isUniqueViolation = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

/** team contest-এ দর্শকের টিম আর রেজিস্ট্রেশনের সময়ের সদস্যরা */
async function viewerTeam(contestId: string, teamId: string | null | undefined): Promise<ContestDetail["viewer"]["team"]> {
  if (!teamId) return null;
  const rows = await prisma!.contestParticipant.findMany({
    where: { contestId, teamId },
    orderBy: { registeredAt: "asc" },
    select: { user: { select: { username: true } }, team: { select: { slug: true, name: true } } },
  });
  if (!rows[0]?.team) return null;
  return { slug: rows[0].team.slug, name: rows[0].team.name, members: rows.map((r) => r.user.username) };
}

/**
 * team contest-এ রেজিস্ট্রেশন: টিমের Accept করা সদস্যরা (দর্শক নিজেও একজন), কেউ যেন আগে থেকে
 * এই কনটেস্টে না থাকে (একক বা অন্য টিমে)। রেজিস্ট্রেশনের পরে টিম বদলালে কনটেস্টে কিছু বদলায় না।
 */
async function teamRoster(
  contest: LoadedContest,
  userId: string,
  teamSlug: string | undefined,
): Promise<{ code: number; error: string } | { teamId: string; userIds: string[] }> {
  if (!teamSlug) return { code: 400, error: "This is a team contest — choose your team" };
  const team = await prisma!.team.findUnique({
    where: { slug: teamSlug },
    select: { id: true, name: true, members: { where: { accepted: true }, select: { userId: true } } },
  });
  if (!team) return { code: 404, error: "Team not found" };
  const userIds = team.members.map((m) => m.userId);
  if (!userIds.includes(userId)) return { code: 403, error: "You are not a member of this team" };
  if (userIds.length > contest.teamSize!) {
    return {
      code: 400,
      error: `${team.name} has ${userIds.length} members — this contest allows at most ${contest.teamSize} per team`,
    };
  }
  const already = await prisma!.contestParticipant.findMany({
    where: { contestId: contest.id, userId: { in: userIds } },
    select: { user: { select: { username: true } } },
  });
  if (already.length) {
    return { code: 409, error: `Already registered in this contest: ${already.map((a) => a.user.username).join(", ")}` };
  }
  return { teamId: team.id, userIds };
}

async function detail(req: FastifyRequest, contest: LoadedContest): Promise<ContestDetail> {
  const viewer = await getSessionUser(req);
  const access = await contestAccess(contest, viewer);
  const team = await viewerTeam(contest.id, access.participation?.teamId);
  return {
    ...toSummary(contest),
    description: contest.description,
    penaltyMinutes: contest.penaltyMinutes,
    freezeMinutes: contest.freezeMinutes,
    hasPassword: contest.passwordHash !== null,
    languages: contest.languages,
    ratedAt: contest.ratedAt?.toISOString() ?? null,
    serverTime: new Date().toISOString(),
    problems: access.canSeeProblems
      ? contest.problems.map((cp) => ({ label: cp.label, slug: cp.problem.slug, title: cp.problem.title }))
      : [],
    viewer: {
      registered: access.registered,
      canManage: access.canManage,
      team,
      participation: access.participation && {
        virtual: access.participation.virtual,
        startedAt: access.participation.startedAt?.toISOString() ?? null,
        endsAt: access.window ? new Date(access.window.end).toISOString() : null,
      },
    },
  };
}

type SlugParams = { Params: { slug: string } };

// কনটেস্টে ১০০০ জন A/B/C-র মধ্যে বারবার যায় — প্রতিবার DB থেকে স্টেটমেন্ট আর sample না এনে
// ৩০ সেকেন্ড মনে রাখি (একসাথে অনেকে চাইলে একটাই query)। author স্টেটমেন্ট ঠিক করলে ≤৩০ সে. পরে দেখায়।
const PROBLEM_TTL_MS = 30_000;
type ProblemBody = Omit<ContestProblemView, "label" | "contest">;
const problemCache = new Map<string, { at: number; value: Promise<ProblemBody> }>();

function problemBody(problemId: string): Promise<ProblemBody> {
  const hit = problemCache.get(problemId);
  if (hit && Date.now() - hit.at < PROBLEM_TTL_MS) return hit.value;
  const value = prisma!.problem
    .findUniqueOrThrow({
      where: { id: problemId },
      include: { tests: { where: { isSample: true }, orderBy: { ordinal: "asc" } } },
    })
    .then((problem) => ({
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
    }))
    .catch((err) => {
      problemCache.delete(problemId);
      throw err;
    });
  if (problemCache.size > 500) problemCache.clear();
  problemCache.set(problemId, { at: Date.now(), value });
  return value;
}

/** প্রবলেম কেন দেখা যাচ্ছে না — WINDOW-এ নিজের ঘড়ি অনুযায়ী */
function noProblemsReason(access: ContestAccess, fallback: string): string {
  if (access.phase === "UPCOMING") return "The contest hasn't started yet";
  if (access.registered && access.personal === "NOT_STARTED") return "Press Start on the contest page to begin your time";
  if (access.registered && access.personal === "FINISHED") {
    return "Your time is over — problems open for practice when the window closes";
  }
  return fallback;
}

/** DB থেকে প্রতিযোগী আর গোনার মতো সাবমিশন এনে standings হিসাব (rating লাগানো হলে পরিবর্তনসহ) */
export async function loadStandings(
  contest: LoadedContest,
  freezeAt: Date | null,
  /** virtual চলাকালীন: আসলরা + শুধু এই virtual প্রতিযোগী (বা তার টিম), প্রত্যেকের নিজের শুরু থেকে cutoffMs পর্যন্ত */
  ghost?: { userId: string; teamId: string | null; cutoffMs: number },
) {
  const mine = ghost && (ghost.teamId ? { teamId: ghost.teamId } : { userId: ghost.userId });
  const [participants, submissions] = await Promise.all([
    prisma!.contestParticipant.findMany({
      where: { contestId: contest.id, ...(mine ? { OR: [{ virtual: false }, mine] } : {}) },
      orderBy: { registeredAt: "asc" },
      select: {
        userId: true,
        startedAt: true,
        virtual: true,
        teamId: true,
        team: { select: { slug: true, name: true } },
        user: {
          select: { username: true, displayName: true, institution: true, batch: true, section: true, rating: true },
        },
      },
    }),
    prisma!.submission.findMany({
      where: { contestId: contest.id, inContest: true },
      orderBy: { createdAt: "asc" },
      select: { userId: true, problemId: true, verdict: true, score: true, createdAt: true },
    }),
  ]);
  const ratingChanges = contest.ratedAt
    ? Object.fromEntries(
        (
          await prisma!.ratingChange.findMany({
            where: { contestId: contest.id },
            select: { oldRating: true, newRating: true, user: { select: { username: true } } },
          })
        ).map((c) => [c.user.username, { old: c.oldRating, new: c.newRating }]),
      )
    : undefined;

  // standings-এর একটা সারি: একক কনটেস্টে একজন, team contest-এ পুরো টিম (সদস্যদের সাবমিশন একসাথে)
  type Row = Parameters<typeof computeStandings>[0]["participants"][number];
  const rows = new Map<string, Row>();
  const rowOf = new Map<string, string>(); // userId → সারির key
  for (const p of participants) {
    const key = p.teamId ?? p.userId;
    rowOf.set(p.userId, key);
    const existing = rows.get(key);
    if (existing?.team) {
      existing.team.members.push(p.user.username);
      continue;
    }
    rows.set(key, {
      userId: key,
      // FIXED-এর আসল প্রতিযোগীরা সবাই কনটেস্টের শুরু থেকে; টিমের সবার Start একই
      startedAt: !p.virtual && contest.type === "FIXED" ? contest.startsAt : p.startedAt,
      virtual: p.virtual,
      ...(p.team
        ? {
            username: p.team.slug,
            displayName: p.team.name,
            institution: null,
            batch: null,
            section: null,
            team: { slug: p.team.slug, name: p.team.name, members: [p.user.username] },
          }
        : p.user),
    });
  }

  const view = computeStandings({
    scoring: contest.scoring,
    penaltyMinutes: contest.penaltyMinutes,
    freezeAt,
    cutoffMs: ghost?.cutoffMs,
    problems: contest.problems.map((cp) => ({ problemId: cp.problem.id, label: cp.label, title: cp.problem.title })),
    participants: [...rows.values()],
    submissions: submissions.flatMap((s) => {
      const key = s.userId ? rowOf.get(s.userId) : undefined;
      return key ? [{ ...s, userId: key }] : [];
    }),
  });
  return ratingChanges ? { ...view, ratingChanges } : view;
}

/**
 * If-None-Match মেলে কি না। Render-এর সামনের Cloudflare gzip করার সময় আমাদের `"abc"` ETag-কে
 * weak `W/"abc"` বানিয়ে দেয় — ব্রাউজার সেটাই ফেরত পাঠায়। তাই `W/` বাদ দিয়ে তুলনা (RFC 9110-এর
 * weak comparison), আর কমা দিয়ে একাধিক ETag থাকলেও চলে।
 */
function etagMatches(header: string | undefined, etag: string): boolean {
  if (!header) return false;
  const strip = (t: string) => t.trim().replace(/^W\//, "");
  const target = strip(etag);
  return header.split(",").some((t) => t.trim() === "*" || strip(t) === target);
}

/** CSV-এর একটা ঘর — কমা/উদ্ধৃতি থাকলে quote; "=", "+", "-", "@" দিয়ে শুরু হলে Excel যেন সূত্র না ভাবে */
function csvCell(value: string | number | null): string {
  let v = value === null ? "" : String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

async function loadOr404(req: FastifyRequest<SlugParams>, reply: FastifyReply) {
  const contest = await loadContestCached(req.params.slug);
  if (!contest) {
    reply.code(404).send({ error: "Contest not found" });
    return null;
  }
  return contest;
}

export async function contestRoutes(app: FastifyInstance) {
  // scope: current (চলছে + আসছে), past (শেষ), managed (আমার বানানো; admin সব)
  app.get<{ Querystring: { scope?: "current" | "past" | "managed" } }>(
    "/contests",
    {
      schema: {
        querystring: {
          type: "object",
          properties: { scope: { type: "string", enum: ["current", "past", "managed"] } },
        },
      },
    },
    async (req, reply) => {
      const viewer = await getSessionUser(req);
      const now = new Date();
      const scope = req.query.scope ?? "current";

      let where: Prisma.ContestWhereInput;
      if (scope === "managed") {
        if (!viewer || viewer.role === "USER") return reply.code(403).send({ error: "Only authors can manage contests" });
        where = viewer.role === "ADMIN" ? {} : { authorId: viewer.id };
      } else {
        // Private কনটেস্ট শুধু তার রেজিস্টার করা প্রতিযোগী আর author তালিকায় দেখে
        const visible: Prisma.ContestWhereInput = viewer
          ? { OR: [{ isPublic: true }, { authorId: viewer.id }, { participants: { some: { userId: viewer.id } } }] }
          : { isPublic: true };
        where = { AND: [visible, scope === "current" ? { endsAt: { gt: now } } : { endsAt: { lte: now } }] };
      }

      const rows = await prisma!.contest.findMany({
        where,
        orderBy: scope === "current" ? { startsAt: "asc" } : { startsAt: "desc" },
        take: 100,
        include: {
          problems: { include: { problem: { select: { id: true, slug: true, title: true } } } },
          author: { select: { username: true } },
          _count: { select: { participants: { where: { virtual: false } } } },
        },
      });
      return { contests: rows.map(toSummary) };
    },
  );

  app.post<{ Body: ContestInput }>("/contests", { schema: { body: CONTEST_BODY } }, async (req, reply) => {
    const user = await requireUser(req, reply, ["AUTHOR", "ADMIN"]);
    if (!user) return reply;
    const v = await validateInput(req.body, user);
    if ("error" in v) return reply.code(400).send({ error: v.error });
    try {
      const contest = await prisma!.$transaction(async (tx) => {
        const c = await tx.contest.create({ data: { ...v.data, authorId: user.id } });
        await setProblems(tx, c.id, v.problemIds);
        return c;
      });
      invalidateContest(contest.slug);
      return reply.code(201).send({ slug: contest.slug });
    } catch (err) {
      if (isUniqueViolation(err)) return reply.code(409).send({ error: "This short name is already used" });
      throw err;
    }
  });

  app.get<SlugParams>("/contests/:slug", async (req, reply) => {
    const contest = await loadOr404(req, reply);
    if (!contest) return reply;
    return detail(req, contest);
  });

  // এডিট ফর্মের জন্য: প্রবলেমের slug তালিকা সহ (পাসওয়ার্ড কখনো ফেরত দিই না)
  app.get<SlugParams>("/contests/:slug/edit", async (req, reply) => {
    const contest = await loadOr404(req, reply);
    if (!contest) return reply;
    const access = await contestAccess(contest, await getSessionUser(req));
    if (!access.canManage) return reply.code(403).send({ error: "You can't edit this contest" });
    return {
      slug: contest.slug,
      title: contest.title,
      description: contest.description,
      startsAt: contest.startsAt.toISOString(),
      durationMinutes: contest.durationMinutes,
      type: contest.type,
      windowMinutes: Math.round((contest.endsAt.getTime() - contest.startsAt.getTime()) / 60_000),
      teamSize: contest.teamSize,
      scoring: contest.scoring,
      penaltyMinutes: contest.penaltyMinutes,
      freezeMinutes: contest.freezeMinutes,
      isPublic: contest.isPublic,
      hasPassword: contest.passwordHash !== null,
      languages: contest.languages,
      problemSlugs: contest.problems.map((cp) => cp.problem.slug),
    };
  });

  app.put<SlugParams & { Body: ContestInput }>(
    "/contests/:slug",
    { schema: { body: CONTEST_BODY } },
    async (req, reply) => {
      const user = await requireUser(req, reply, ["AUTHOR", "ADMIN"]);
      if (!user) return reply;
      const contest = await loadOr404(req, reply);
      if (!contest) return reply;
      if (user.role !== "ADMIN" && contest.authorId !== user.id) {
        return reply.code(403).send({ error: "You can't edit this contest" });
      }
      // রেজিস্ট্রেশন শুরু হলে একক ↔ টিম বদলানো যায় না (আগের রেজিস্ট্রেশন অর্থহীন হয়ে যেত)
      const switching = req.body.teamSize !== undefined && (req.body.teamSize === null) !== (contest.teamSize === null);
      if (switching && (await prisma!.contestParticipant.count({ where: { contestId: contest.id } })) > 0) {
        return reply.code(409).send({ error: "People already registered — you can't switch between team and individual now" });
      }
      const v = await validateInput(req.body, user);
      if ("error" in v) return reply.code(400).send({ error: v.error });
      try {
        await prisma!.$transaction(async (tx) => {
          await tx.contest.update({ where: { id: contest.id }, data: v.data });
          await setProblems(tx, contest.id, v.problemIds);
        });
      } catch (err) {
        if (isUniqueViolation(err)) return reply.code(409).send({ error: "This short name is already used" });
        throw err;
      }
      invalidateContest(contest.slug, v.data.slug);
      return { slug: v.data.slug };
    },
  );

  app.post<SlugParams & { Body: { password?: string; team?: string } }>(
    "/contests/:slug/register",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        body: {
          type: "object",
          properties: { password: { type: "string", maxLength: 100 }, team: { type: "string", maxLength: 60 } },
        },
      },
    },
    async (req, reply) => {
      const user = await requireUser(req, reply);
      if (!user) return reply;
      const contest = await loadOr404(req, reply);
      if (!contest) return reply;
      const access = await contestAccess(contest, user);
      if (access.phase === "ENDED") return reply.code(409).send({ error: "This contest has ended" });
      if (access.registered) return { ok: true };
      if (contest.passwordHash && !(await verifyPassword(req.body?.password ?? "", contest.passwordHash))) {
        return reply.code(403).send({ error: "Wrong contest password" });
      }
      if (contest.teamSize) {
        // একজন সদস্য পুরো টিম রেজিস্টার করে (সবার এক সাথে)
        const roster = await teamRoster(contest, user.id, req.body?.team);
        if ("error" in roster) return reply.code(roster.code).send({ error: roster.error });
        try {
          await prisma!.contestParticipant.createMany({
            data: roster.userIds.map((userId) => ({ contestId: contest.id, userId, teamId: roster.teamId })),
          });
        } catch (err) {
          if (isUniqueViolation(err)) return reply.code(409).send({ error: "Someone in the team just registered — reload" });
          throw err;
        }
        forgetParticipation(contest.id, roster.userIds);
        forgetTeammates(roster.userIds);
      } else {
        await prisma!.contestParticipant.upsert({
          where: { contestId_userId: { contestId: contest.id, userId: user.id } },
          create: { contestId: contest.id, userId: user.id },
          update: {},
        });
        rememberParticipation(contest.id, user.id, { virtual: false, startedAt: null, teamId: null });
      }
      invalidateContest(contest.slug); // প্রতিযোগীর সংখ্যা বদলেছে
      return { ok: true };
    },
  );

  // WINDOW: রেজিস্টার করা প্রতিযোগী নিজের সময়ে শুরু করে — তখন থেকে তার ঘড়ি চলে
  app.post<SlugParams>("/contests/:slug/start", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return reply;
    const contest = await loadOr404(req, reply);
    if (!contest) return reply;
    if (contest.type !== "WINDOW") return reply.code(400).send({ error: "This contest starts at a fixed time" });
    const access = await contestAccess(contest, user);
    if (!access.registered) return reply.code(403).send({ error: "Register for the contest first" });
    if (access.phase === "UPCOMING") return reply.code(409).send({ error: "The window hasn't opened yet" });
    if (access.phase === "ENDED") return reply.code(409).send({ error: "The window has closed" });
    if (access.participation?.startedAt) return detail(req, contest); // দুবার চাপলে কিছু হয় না

    // দুই ট্যাব থেকে একসাথে চাপলেও প্রথম সময়টাই থাকে; টিমে একজন চাপলে পুরো টিমের ঘড়ি চলে
    const teamId = access.participation?.teamId;
    const who = teamId ? { teamId } : { userId: user.id };
    await prisma!.contestParticipant.updateMany({
      where: { contestId: contest.id, ...who, startedAt: null },
      data: { startedAt: new Date() },
    });
    if (teamId) {
      const mates = await prisma!.contestParticipant.findMany({ where: { contestId: contest.id, teamId }, select: { userId: true } });
      forgetParticipation(contest.id, mates.map((m) => m.userId));
    } else {
      const row = await prisma!.contestParticipant.findUniqueOrThrow({
        where: { contestId_userId: { contestId: contest.id, userId: user.id } },
        select: PARTICIPATION_SELECT,
      });
      rememberParticipation(contest.id, user.id, row);
    }
    return detail(req, contest);
  });

  // কনটেস্ট শেষে: যে আসলে অংশ নেয়নি, সে নিজের সময়ে একই সময়সীমায় দিতে পারে
  app.post<SlugParams & { Body: { team?: string } | undefined }>(
    "/contests/:slug/virtual",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: { body: { type: ["object", "null"], properties: { team: { type: "string", maxLength: 60 } } } },
    },
    async (req, reply) => {
      const user = await requireUser(req, reply);
      if (!user) return reply;
      const contest = await loadOr404(req, reply);
      if (!contest) return reply;
      const access = await contestAccess(contest, user);
      if (access.phase !== "ENDED") return reply.code(409).send({ error: "Virtual participation opens after the contest ends" });
      if (!contest.isPublic) return reply.code(403).send({ error: "Virtual participation is only for public contests" });
      if (access.canManage) return reply.code(409).send({ error: "You manage this contest" });
      if (access.participation) {
        return reply.code(409).send({
          error: access.participation.virtual ? "You already did this contest virtually" : "You took part in this contest",
        });
      }
      const startedAt = new Date();
      if (contest.teamSize) {
        // team contest-এ virtual-ও পুরো টিম মিলে, একই ঘড়িতে
        const roster = await teamRoster(contest, user.id, req.body?.team);
        if ("error" in roster) return reply.code(roster.code).send({ error: roster.error });
        try {
          await prisma!.contestParticipant.createMany({
            data: roster.userIds.map((userId) => ({ contestId: contest.id, userId, teamId: roster.teamId, virtual: true, startedAt })),
          });
        } catch (err) {
          if (!isUniqueViolation(err)) throw err; // দুবার চাপলে
        }
        forgetParticipation(contest.id, roster.userIds);
        forgetTeammates(roster.userIds);
        return detail(req, contest);
      }
      try {
        await prisma!.contestParticipant.create({
          data: { contestId: contest.id, userId: user.id, virtual: true, startedAt },
        });
      } catch (err) {
        if (!isUniqueViolation(err)) throw err; // দুবার চাপলে
      }
      const row = await prisma!.contestParticipant.findUniqueOrThrow({
        where: { contestId_userId: { contestId: contest.id, userId: user.id } },
        select: PARTICIPATION_SELECT,
      });
      rememberParticipation(contest.id, user.id, row);
      return detail(req, contest);
    },
  );

  app.get<SlugParams>("/contests/:slug/standings", async (req, reply) => {
    const contest = await loadOr404(req, reply);
    if (!contest) return reply;
    const viewer = await getSessionUser(req);
    const viewerId = viewer?.id;
    const access = await contestAccess(contest, viewer);
    if (!contest.isPublic && !access.registered && !access.canManage) {
      return reply.code(403).send({ error: "Only participants can see the standings of this contest" });
    }
    // শুরুর আগে প্রবলেমের নামও ফাঁস হবে না
    if (access.phase === "UPCOMING" && !access.canManage) {
      return reply.code(403).send({ error: "Standings appear when the contest starts" });
    }
    // WINDOW: যারা পরে শুরু করবে তারা যেন জেনে না যায় কোন প্রবলেম সহজ
    if (contest.type === "WINDOW" && access.phase === "RUNNING" && !access.canManage) {
      return reply.code(403).send({ error: "Standings appear when the window closes" });
    }

    // Freeze শুধু চলাকালীন আর author-ছাড়া সবার জন্য; শেষ হলে নিজে থেকে খুলে যায়
    const freezeAt =
      contest.freezeMinutes > 0 && access.phase === "RUNNING" && !access.canManage
        ? new Date(contest.endsAt.getTime() - contest.freezeMinutes * 60_000)
        : null;
    const effectiveFreeze = freezeAt && Date.now() >= freezeAt.getTime() ? freezeAt : null;

    // virtual চলাকালীন: আসলরা ঠিক ততক্ষণ পর্যন্ত যতক্ষণ এই প্রতিযোগী দিচ্ছে (১০ সেকেন্ডে এক ধাপ)
    const ghostMs =
      access.participation?.virtual && access.personal === "RUNNING" && access.window
        ? Math.floor((Date.now() - access.window.start) / 10_000) * 10_000
        : null;

    // কনটেস্ট এডিট হলে (updatedAt বদলালে) পুরোনো cache আর ব্যবহার হয় না
    const key =
      `${contest.id}:${contest.updatedAt.getTime()}:${effectiveFreeze ? "frozen" : "live"}` +
      (ghostMs !== null ? `:ghost:${viewerId}:${ghostMs}` : "");
    const ttl = access.phase === "RUNNING" || ghostMs !== null ? 10_000 : 60_000;

    const { json, gzip, etag } = await cachedStandings(key, ttl, async () => {
      if (ghostMs === null) return loadStandings(contest, effectiveFreeze);
      const view = await loadStandings(contest, null, {
        userId: viewerId!,
        teamId: access.participation?.teamId ?? null,
        cutoffMs: ghostMs,
      });
      return { ...view, ghostMinute: Math.floor(ghostMs / 60_000) };
    });

    // ব্রাউজার আগের ETag পাঠালে আর কিছু না বদলালে শুধু 304 (প্রায় ০ বাইট)
    reply.header("etag", etag).header("cache-control", "private, no-cache").header("vary", "accept-encoding");
    if (etagMatches(req.headers["if-none-match"], etag)) return reply.code(304).send();
    reply.type("application/json; charset=utf-8");
    if (/gzip/.test(req.headers["accept-encoding"] ?? "")) {
      // আগে থেকে compress করা — compress plugin content-encoding দেখে আর হাত দেয় না
      return reply.header("content-encoding", "gzip").send(gzip);
    }
    return reply.send(json);
  });


  // মার্কস দেওয়ার জন্য: সবসময় freeze ছাড়া আসল ফল, শুধু author/admin
  app.get<SlugParams>("/contests/:slug/standings.csv", async (req, reply) => {
    const contest = await loadOr404(req, reply);
    if (!contest) return reply;
    const access = await contestAccess(contest, await getSessionUser(req));
    if (!access.canManage) return reply.code(403).send({ error: "Only the contest author can export standings" });

    const s = await loadStandings(contest, null);
    const icpc = s.scoring === "ICPC";
    const header = ["Rank", "Username", "Name", "Institution", "Batch", "Section", icpc ? "Solved" : "Score"];
    if (icpc) header.push("Penalty");
    for (const p of s.problems) {
      if (icpc) header.push(`${p.label} solved`, `${p.label} minute`, `${p.label} wrong`);
      else header.push(`${p.label} score`);
    }
    const lines = [header.map(csvCell).join(",")];
    // মার্কসের জন্য শুধু আসল প্রতিযোগী (virtual বাদ)
    for (const r of s.rows.filter((row) => !row.virtual)) {
      // টিমের সারিতে: Username = টিমের নাম, Name = সদস্যরা
      const cells: (string | number | null)[] = r.team
        ? [r.rank, r.team.name, r.team.members.join(" "), null, null, null, r.points]
        : [r.rank, r.username, r.displayName, r.institution, r.batch, r.section, r.points];
      if (icpc) cells.push(r.penalty);
      for (const p of s.problems) {
        const c = r.cells[p.label]!;
        if (icpc) cells.push(c.solved ? 1 : 0, c.solvedAtMinute, c.wrong);
        else cells.push(c.score ?? 0);
      }
      lines.push(cells.map(csvCell).join(","));
    }
    // শুরুতে BOM দিলে Excel বাংলা নাম ঠিকমতো (UTF-8) খোলে
    const csv = "\uFEFF" + lines.join("\r\n") + "\r\n";
    return reply
      .type("text/csv; charset=utf-8")
      .header("content-disposition", `attachment; filename="${contest.slug}-standings.csv"`)
      .header("cache-control", "no-store")
      .send(csv);
  });

  app.get<{ Params: { slug: string; label: string } }>("/contests/:slug/problems/:label", async (req, reply) => {
    const contest = await loadContestCached(req.params.slug);
    if (!contest) return reply.code(404).send({ error: "Contest not found" });
    const access = await contestAccess(contest, await getSessionUser(req));
    if (!access.canSeeProblems) {
      return reply.code(403).send({
        error: noProblemsReason(access, "Register for the contest to see problems"),
      });
    }
    const cp = contest.problems.find((p) => p.label === req.params.label.toUpperCase());
    if (!cp) return reply.code(404).send({ error: "Problem not found" });

    const view: ContestProblemView = {
      ...(await problemBody(cp.problem.id)),
      label: cp.label,
      contest: { slug: contest.slug, title: contest.title, phase: access.phase },
    };
    return view;
  });

  app.post<{ Params: { slug: string }; Body: { label: string; language: Language; source: string } }>(
    "/contests/:slug/submissions",
    {
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
          required: ["label", "language", "source"],
          properties: {
            label: { type: "string", maxLength: 2 },
            language: { type: "string", enum: [...LANGUAGES] },
            source: { type: "string", minLength: 1 },
          },
        },
      },
    },
    async (req, reply) => {
      const user = await requireUser(req, reply);
      if (!user) return reply;
      if (Buffer.byteLength(req.body.source) > MAX_SOURCE_BYTES) {
        return reply.code(413).send({ error: `Source code is larger than ${MAX_SOURCE_BYTES / 1024} KB` });
      }
      const contest = await loadContestCached(req.params.slug);
      if (!contest) return reply.code(404).send({ error: "Contest not found" });
      const access = await contestAccess(contest, user);
      if (!access.canSeeProblems) {
        return reply.code(403).send({
          error: noProblemsReason(access, "Register for the contest first"),
        });
      }
      const cp = contest.problems.find((p) => p.label === req.body.label.toUpperCase());
      if (!cp) return reply.code(404).send({ error: "Problem not found" });
      // শেষ হওয়ার পর (upsolve) যেকোনো ভাষা; তার আগে শুধু author-এর বাছাই করা ভাষা
      if (access.phase !== "ENDED" && !contest.languages.includes(req.body.language)) {
        const allowed = contest.languages.map((l) => LANGUAGE_INFO[l].short).join(", ");
        return reply.code(400).send({ error: `This contest only accepts: ${allowed}` });
      }

      const submission = await prisma!.submission.create({
        data: {
          problemId: cp.problem.id,
          userId: user.id,
          contestId: contest.id,
          // নিজের ঘড়িতে চলাকালীন প্রতিযোগী (আসল বা virtual) → standings-এ গোনা হবে; বাকিটা upsolve/টেস্ট
          inContest: access.countsForStandings,
          language: req.body.language,
          source: req.body.source,
        },
        select: { id: true },
      });
      notifyWork();
      return reply.code(201).send(submission);
    },
  );
}
