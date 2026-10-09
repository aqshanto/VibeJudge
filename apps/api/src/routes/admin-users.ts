// Admin: CSV থেকে একসাথে অনেক অ্যাকাউন্ট (যেমন ল্যাব ফাইনালের পুরো ব্যাচ)।
// ব্রাউজার CSV পড়ে ২০০টা করে সারি পাঠায়; প্রতিটা অ্যাকাউন্টে random পাসওয়ার্ড, যেটা শুধু উত্তরে
// একবার ফেরত যায় — DB-তে শুধু hash থাকে।

import type { FastifyInstance } from "fastify";
import {
  MAX_BULK_ROWS,
  USERNAME_PATTERN,
  type BulkUserRequest,
  type BulkUserResult,
} from "@vibejudge/shared";
import { prisma } from "../db.js";
import { requireUser } from "../auth/guards.js";
import { generatePassword, hashPassword } from "../auth/password.js";
import { invalidateContest } from "../contest-access.js";

const USERNAME_RE = new RegExp(USERNAME_PATTERN);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// ইমেইল না দিলে — ইউনিক রাখতে username দিয়ে (এই ঠিকানায় কখনো মেইল যায় না)
const placeholderEmail = (username: string) => `${username}@students.vibejudge.local`;

const str = (max: number) => ({ type: "string", maxLength: max });

export async function adminUserRoutes(app: FastifyInstance) {
  app.post<{ Body: BulkUserRequest }>(
    "/admin/users/bulk",
    {
      schema: {
        body: {
          type: "object",
          required: ["rows"],
          properties: {
            contestSlug: str(100),
            rows: {
              type: "array",
              minItems: 1,
              maxItems: MAX_BULK_ROWS,
              items: {
                type: "object",
                required: ["username"],
                properties: {
                  username: str(40),
                  displayName: str(60),
                  email: str(200),
                  institution: str(100),
                  batch: str(30),
                  section: str(30),
                },
              },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const admin = await requireUser(req, reply, ["ADMIN"]);
      if (!admin) return reply;

      const contest = req.body.contestSlug
        ? await prisma!.contest.findUnique({ where: { slug: req.body.contestSlug }, select: { id: true, slug: true } })
        : null;
      if (req.body.contestSlug && !contest) return reply.code(404).send({ error: "Contest not found" });

      const result: BulkUserResult = { created: [], skipped: [], registered: 0 };
      const clean = (v?: string) => v?.trim() || null;

      // ১) যাচাই আর একই ফাইলে দুবার থাকা বাদ
      const seen = new Set<string>();
      const valid = [];
      for (const row of req.body.rows) {
        const username = row.username.trim().toLowerCase();
        const email = clean(row.email)?.toLowerCase() ?? placeholderEmail(username);
        if (!USERNAME_RE.test(username)) {
          result.skipped.push({ username: row.username, reason: "invalid username (3–20: a-z 0-9 _ . -)" });
        } else if (!EMAIL_RE.test(email)) {
          result.skipped.push({ username, reason: "invalid email" });
        } else if (seen.has(username)) {
          result.skipped.push({ username, reason: "duplicate in this file" });
        } else {
          seen.add(username);
          valid.push({ ...row, username, email });
        }
      }

      // ২) আগে থেকে আছে এমন username/email বাদ (তবে কনটেস্টে রেজিস্টার করা হবে)
      const existing = await prisma!.user.findMany({
        where: {
          OR: [{ username: { in: valid.map((r) => r.username) } }, { email: { in: valid.map((r) => r.email) } }],
        },
        select: { id: true, username: true, email: true },
      });
      const takenUsernames = new Map(existing.map((u) => [u.username, u.id]));
      const takenEmails = new Set(existing.map((u) => u.email));
      const toCreate = valid.filter((r) => {
        if (takenUsernames.has(r.username)) {
          result.skipped.push({ username: r.username, reason: "already exists" });
          return false;
        }
        if (takenEmails.has(r.email)) {
          result.skipped.push({ username: r.username, reason: "email already used by another account" });
          return false;
        }
        return true;
      });

      // ৩) পাসওয়ার্ড আর hash ("light" — random পাসওয়ার্ডের জন্য যথেষ্ট, আর ০.১ CPU-তেও দ্রুত)
      const withPasswords = await Promise.all(
        toCreate.map(async (r) => {
          const password = generatePassword();
          return { row: r, password, passwordHash: await hashPassword(password, "light") };
        }),
      );

      const created = await prisma!.user.createManyAndReturn({
        data: withPasswords.map(({ row, passwordHash }) => ({
          username: row.username,
          email: row.email,
          displayName: clean(row.displayName),
          institution: clean(row.institution),
          batch: clean(row.batch),
          section: clean(row.section),
          passwordHash,
          role: "USER" as const,
        })),
        select: { id: true, username: true, displayName: true, section: true },
        skipDuplicates: true, // একই সময়ে অন্য কেউ একই নাম নিলে
      });
      const passwordOf = new Map(withPasswords.map((w) => [w.row.username, w.password]));
      for (const u of created) {
        result.created.push({ username: u.username, password: passwordOf.get(u.username)!, displayName: u.displayName, section: u.section });
      }
      for (const w of withPasswords) {
        if (!created.some((u) => u.username === w.row.username)) {
          result.skipped.push({ username: w.row.username, reason: "already exists" });
        }
      }

      // ৪) কনটেস্টে রেজিস্ট্রেশন — নতুন আর আগে থেকে থাকা দুই রকমই
      if (contest) {
        const userIds = [...created.map((u) => u.id), ...valid.flatMap((r) => takenUsernames.get(r.username) ?? [])];
        const reg = await prisma!.contestParticipant.createMany({
          data: userIds.map((userId) => ({ contestId: contest.id, userId })),
          skipDuplicates: true,
        });
        result.registered = reg.count;
        invalidateContest(contest.slug);
      }

      req.log.info(
        { admin: admin.username, created: result.created.length, skipped: result.skipped.length, contest: contest?.slug },
        "bulk accounts",
      );
      return result;
    },
  );
}
