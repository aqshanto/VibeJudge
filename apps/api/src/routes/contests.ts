import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  CONTEST_LIMITS,
  LANGUAGES,
  MAX_SOURCE_BYTES,
  SLUG_PATTERN,
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
  rememberRegistration,
  type LoadedContest,
} from "../contest-access.js";
import { notifyWork } from "../queue.js";
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
    password: { type: "string", maxLength: 100 },
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
    startsAt: c.startsAt.toISOString(),
    durationMinutes: c.durationMinutes,
    scoring: c.scoring,
    isPublic: c.isPublic,
    author: c.author?.username ?? null,
    participantCount: c._count.participants,
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
    endsAt: new Date(startsAt.getTime() + input.durationMinutes * 60_000),
    scoring: input.scoring,
    penaltyMinutes: input.penaltyMinutes,
    freezeMinutes: input.freezeMinutes,
    isPublic: input.isPublic,
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

async function detail(req: FastifyRequest, contest: LoadedContest): Promise<ContestDetail> {
  const viewer = await getSessionUser(req);
  const access = await contestAccess(contest, viewer);
  return {
    ...toSummary(contest),
    description: contest.description,
    penaltyMinutes: contest.penaltyMinutes,
    freezeMinutes: contest.freezeMinutes,
    hasPassword: contest.passwordHash !== null,
    serverTime: new Date().toISOString(),
    problems: access.canSeeProblems
      ? contest.problems.map((cp) => ({ label: cp.label, slug: cp.problem.slug, title: cp.problem.title }))
      : [],
    viewer: { registered: access.registered, canManage: access.canManage },
  };
}

type SlugParams = { Params: { slug: string } };

/** DB থেকে প্রতিযোগী আর গোনার মতো সাবমিশন এনে standings হিসাব */
async function loadStandings(contest: LoadedContest, freezeAt: Date | null) {
  const [participants, submissions] = await Promise.all([
    prisma!.contestParticipant.findMany({
      where: { contestId: contest.id },
      select: {
        userId: true,
        user: { select: { username: true, displayName: true, institution: true, batch: true, section: true } },
      },
    }),
    prisma!.submission.findMany({
      where: { contestId: contest.id, inContest: true },
      orderBy: { createdAt: "asc" },
      select: { userId: true, problemId: true, verdict: true, score: true, createdAt: true },
    }),
  ]);
  return computeStandings({
    scoring: contest.scoring,
    startsAt: contest.startsAt,
    penaltyMinutes: contest.penaltyMinutes,
    freezeAt,
    problems: contest.problems.map((cp) => ({ problemId: cp.problem.id, label: cp.label, title: cp.problem.title })),
    participants: participants.map((p) => ({ userId: p.userId, ...p.user })),
    submissions: submissions.filter((s): s is typeof s & { userId: string } => s.userId !== null),
  });
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
          _count: { select: { participants: true } },
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
      scoring: contest.scoring,
      penaltyMinutes: contest.penaltyMinutes,
      freezeMinutes: contest.freezeMinutes,
      isPublic: contest.isPublic,
      hasPassword: contest.passwordHash !== null,
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

  app.post<SlugParams & { Body: { password?: string } }>(
    "/contests/:slug/register",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: { body: { type: "object", properties: { password: { type: "string", maxLength: 100 } } } },
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
      await prisma!.contestParticipant.upsert({
        where: { contestId_userId: { contestId: contest.id, userId: user.id } },
        create: { contestId: contest.id, userId: user.id },
        update: {},
      });
      rememberRegistration(contest.id, user.id);
      invalidateContest(contest.slug); // প্রতিযোগীর সংখ্যা বদলেছে
      return { ok: true };
    },
  );

  app.get<SlugParams>("/contests/:slug/standings", async (req, reply) => {
    const contest = await loadOr404(req, reply);
    if (!contest) return reply;
    const access = await contestAccess(contest, await getSessionUser(req));
    if (!contest.isPublic && !access.registered && !access.canManage) {
      return reply.code(403).send({ error: "Only participants can see the standings of this contest" });
    }
    // শুরুর আগে প্রবলেমের নামও ফাঁস হবে না
    if (access.phase === "UPCOMING" && !access.canManage) {
      return reply.code(403).send({ error: "Standings appear when the contest starts" });
    }

    // Freeze শুধু চলাকালীন আর author-ছাড়া সবার জন্য; শেষ হলে নিজে থেকে খুলে যায়
    const freezeAt =
      contest.freezeMinutes > 0 && access.phase === "RUNNING" && !access.canManage
        ? new Date(contest.endsAt.getTime() - contest.freezeMinutes * 60_000)
        : null;
    const effectiveFreeze = freezeAt && Date.now() >= freezeAt.getTime() ? freezeAt : null;

    // কনটেস্ট এডিট হলে (updatedAt বদলালে) পুরোনো cache আর ব্যবহার হয় না
    const key = `${contest.id}:${contest.updatedAt.getTime()}:${effectiveFreeze ? "frozen" : "live"}`;
    const ttl = access.phase === "RUNNING" ? 10_000 : 60_000;

    const { json, gzip, etag } = await cachedStandings(key, ttl, () => loadStandings(contest, effectiveFreeze));

    // ব্রাউজার আগের ETag পাঠালে আর কিছু না বদলালে শুধু 304 (প্রায় ০ বাইট)
    reply.header("etag", etag).header("cache-control", "private, no-cache").header("vary", "accept-encoding");
    if (req.headers["if-none-match"] === etag) return reply.code(304).send();
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
    for (const r of s.rows) {
      const cells: (string | number | null)[] = [r.rank, r.username, r.displayName, r.institution, r.batch, r.section, r.points];
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
        error: access.phase === "UPCOMING" ? "The contest hasn't started yet" : "Register for the contest to see problems",
      });
    }
    const cp = contest.problems.find((p) => p.label === req.params.label.toUpperCase());
    if (!cp) return reply.code(404).send({ error: "Problem not found" });

    const problem = await prisma!.problem.findUniqueOrThrow({
      where: { id: cp.problem.id },
      include: { tests: { where: { isSample: true }, orderBy: { ordinal: "asc" } } },
    });
    const view: ContestProblemView = {
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
          error: access.phase === "UPCOMING" ? "The contest hasn't started yet" : "Register for the contest first",
        });
      }
      const cp = contest.problems.find((p) => p.label === req.body.label.toUpperCase());
      if (!cp) return reply.code(404).send({ error: "Problem not found" });

      const submission = await prisma!.submission.create({
        data: {
          problemId: cp.problem.id,
          userId: user.id,
          contestId: contest.id,
          // চলাকালীন রেজিস্টার করা প্রতিযোগী → standings-এ গোনা হবে; বাকিটা upsolve/টেস্ট
          inContest: access.phase === "RUNNING" && access.registered,
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
