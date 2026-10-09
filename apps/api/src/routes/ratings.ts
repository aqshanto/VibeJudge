// Rating লাগানো/ফেরানো (শুধু Admin) আর rating-এর তালিকা।
//
// কনটেস্ট শেষ হলে Admin নিজে "Apply rating" চাপেন — আগে কোড মিলের রিপোর্ট দেখে নেওয়ার সুযোগ থাকে।
// শুধু একক কনটেস্ট; virtual বাদ; যে অন্তত একটা সাবমিশন দিয়েছে শুধু সে গোনা হয় (Codeforces-এর মতো)।

import type { FastifyInstance } from "fastify";
import type { RatingRow } from "@vibejudge/shared";
import { prisma } from "../db.js";
import { requireUser } from "../auth/guards.js";
import { contestAccess, invalidateContest, loadContestCached } from "../contest-access.js";
import { INITIAL_RATING, computeRatingChanges } from "../rating.js";
import { loadStandings } from "./contests.js";

type SlugParams = { Params: { slug: string } };

export async function ratingRoutes(app: FastifyInstance) {
  app.post<SlugParams>("/contests/:slug/rating", async (req, reply) => {
    const user = await requireUser(req, reply, ["ADMIN"]);
    if (!user) return reply;
    const contest = await loadContestCached(req.params.slug);
    if (!contest) return reply.code(404).send({ error: "Contest not found" });
    if ((await contestAccess(contest, user)).phase !== "ENDED") {
      return reply.code(409).send({ error: "Rating can be applied after the contest ends" });
    }
    if (contest.teamSize) return reply.code(409).send({ error: "Team contests are not rated" });
    if (contest.ratedAt) return reply.code(409).send({ error: "Rating is already applied to this contest" });

    // যারা অন্তত একটা সাবমিশন দিয়েছে (চলাকালীন, আসল প্রতিযোগী হিসেবে)
    const submitted = new Set(
      (
        await prisma!.submission.findMany({
          where: { contestId: contest.id, inContest: true, userId: { not: null } },
          distinct: ["userId"],
          select: { userId: true },
        })
      ).map((s) => s.userId!),
    );
    const standings = await loadStandings(contest, null);
    const users = await prisma!.user.findMany({
      where: { id: { in: [...submitted] } },
      select: { id: true, username: true, rating: true },
    });
    const byName = new Map(users.map((u) => [u.username, u]));
    const rated = standings.rows
      .filter((r) => !r.virtual && byName.has(r.username))
      .map((r) => {
        const u = byName.get(r.username)!;
        return { userId: u.id, rating: u.rating ?? INITIAL_RATING, points: r.points, penalty: r.penalty };
      });
    if (rated.length < 2) return reply.code(409).send({ error: "At least 2 participants must have submitted" });

    const changes = computeRatingChanges(rated);
    const done = await prisma!.$transaction(async (tx) => {
      // দুজন Admin একসাথে চাপলেও একবারই
      const claimed = await tx.contest.updateMany({ where: { id: contest.id, ratedAt: null }, data: { ratedAt: new Date() } });
      if (claimed.count === 0) return false;
      await tx.ratingChange.createMany({
        data: changes.map((c) => ({ contestId: contest.id, ...c })),
      });
      await tx.$executeRaw`
        UPDATE "users" u
        SET "rating" = v.r, "maxRating" = GREATEST(COALESCE(u."maxRating", v.r), v.r)
        FROM (SELECT unnest(${changes.map((c) => c.userId)}::text[]) AS id,
                     unnest(${changes.map((c) => c.newRating)}::int[]) AS r) v
        WHERE u."id" = v.id`;
      return true;
    });
    if (!done) return reply.code(409).send({ error: "Rating is already applied to this contest" });
    invalidateContest(contest.slug);
    return { rated: changes.length };
  });

  // সবচেয়ে শেষে লাগানো rating-ই শুধু ফেরানো যায় (পরের কনটেস্টের হিসাব এর উপর দাঁড়িয়ে থাকে)
  app.delete<SlugParams>("/contests/:slug/rating", async (req, reply) => {
    const user = await requireUser(req, reply, ["ADMIN"]);
    if (!user) return reply;
    const contest = await loadContestCached(req.params.slug);
    if (!contest) return reply.code(404).send({ error: "Contest not found" });
    if (!contest.ratedAt) return reply.code(409).send({ error: "This contest isn't rated" });
    const latest = await prisma!.contest.findFirst({
      where: { ratedAt: { not: null } },
      orderBy: { ratedAt: "desc" },
      select: { id: true, title: true },
    });
    if (latest && latest.id !== contest.id) {
      return reply.code(409).send({ error: `Only the most recently rated contest can be undone (${latest.title})` });
    }

    await prisma!.$transaction(async (tx) => {
      const removed = await tx.ratingChange.findMany({ where: { contestId: contest.id }, select: { userId: true } });
      await tx.ratingChange.deleteMany({ where: { contestId: contest.id } });
      // আগের অবস্থা: বাকি ইতিহাসের শেষটা (না থাকলে unrated)
      await tx.$executeRaw`
        UPDATE "users" u
        SET "rating" = (SELECT rc."newRating" FROM "rating_changes" rc WHERE rc."userId" = u."id" ORDER BY rc."createdAt" DESC LIMIT 1),
            "maxRating" = (SELECT max(rc."newRating") FROM "rating_changes" rc WHERE rc."userId" = u."id")
        WHERE u."id" = ANY(${removed.map((r) => r.userId)}::text[])`;
      await tx.contest.update({ where: { id: contest.id }, data: { ratedAt: null } });
    });
    invalidateContest(contest.slug);
    return { ok: true };
  });

  app.get<{ Querystring: { limit?: number } }>(
    "/ratings",
    { schema: { querystring: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 500 } } } } },
    async (req) => {
      const users = await prisma!.user.findMany({
        where: { rating: { not: null } },
        orderBy: [{ rating: "desc" }, { username: "asc" }],
        take: req.query.limit ?? 200,
        select: {
          username: true,
          displayName: true,
          rating: true,
          maxRating: true,
          _count: { select: { ratingChanges: true } },
        },
      });
      let prev: { rating: number; rank: number } | null = null;
      const rows: RatingRow[] = users.map((u, i) => {
        const rank = prev && prev.rating === u.rating ? prev.rank : i + 1;
        prev = { rating: u.rating!, rank };
        return {
          rank,
          username: u.username,
          displayName: u.displayName,
          rating: u.rating!,
          maxRating: u.maxRating ?? u.rating!,
          contests: u._count.ratingChanges,
        };
      });
      return { users: rows };
    },
  );
}
