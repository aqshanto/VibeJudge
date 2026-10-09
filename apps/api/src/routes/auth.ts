import { randomInt } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { PASSWORD_MIN_LENGTH, USERNAME_PATTERN, type MeResponse } from "@vibejudge/shared";
import { prisma } from "../db.js";
import { env, googleEnabled } from "../env.js";
import { OAUTH_STATE_COOKIE, exchangeCode, googleAuthUrl, newState } from "../auth/google.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { cookieOptions, createSession, destroySession, getSessionUser, toAuthUser } from "../auth/session.js";

const USERNAME_RE = new RegExp(USERNAME_PATTERN);

// ল্যাবের ১০০০ জন একই IP শেয়ার করে, তাই শুধু IP ধরে সীমা দিলে সবাই আটকে যাবে।
// লগইন: একই IP থেকে একই অ্যাকাউন্টে মিনিটে ১০ বার (পাসওয়ার্ড আন্দাজ আটকাতে)।
const LOGIN_RATE_LIMIT = {
  rateLimit: {
    max: 10,
    timeWindow: "1 minute",
    hook: "preHandler" as const, // body পড়ার পরে, যাতে login নামটা পাওয়া যায়
    keyGenerator: (req: FastifyRequest) =>
      `${req.ip}|${String((req.body as { login?: unknown } | undefined)?.login ?? "").toLowerCase()}`,
  },
};
// রেজিস্ট্রেশন: IP প্রতি মিনিটে ৬০টা (একটা ল্যাব একসাথে অ্যাকাউন্ট খুললেও চলবে)
const REGISTER_RATE_LIMIT = { rateLimit: { max: 60, timeWindow: "1 minute" } };

/** ADMIN_EMAILS-এ থাকলে ADMIN, নাহলে যা আছে তাই */
function roleFor(email: string, current: "USER" | "AUTHOR" | "ADMIN" = "USER") {
  return env.adminEmails.has(email) ? ("ADMIN" as const) : current;
}

export async function authRoutes(app: FastifyInstance) {
  app.get("/me", async (req): Promise<MeResponse> => {
    return { user: await getSessionUser(req), googleEnabled };
  });

  app.post<{ Body: { email: string; username: string; password: string; displayName?: string } }>(
    "/register",
    {
      config: REGISTER_RATE_LIMIT,
      schema: {
        body: {
          type: "object",
          required: ["email", "username", "password"],
          properties: {
            email: { type: "string", format: "email", maxLength: 200 },
            username: { type: "string", minLength: 1, maxLength: 40 },
            password: { type: "string", minLength: PASSWORD_MIN_LENGTH, maxLength: 200 },
            displayName: { type: "string", maxLength: 60 },
          },
        },
      },
    },
    async (req, reply) => {
      const email = req.body.email.trim().toLowerCase();
      const username = req.body.username.trim().toLowerCase();
      if (!USERNAME_RE.test(username)) {
        return reply.code(400).send({ error: "Username must be 3–20 characters: a-z, 0-9, _ . -" });
      }
      const taken = await prisma!.user.findFirst({
        where: { OR: [{ email }, { username }] },
        select: { email: true },
      });
      if (taken) {
        return reply
          .code(409)
          .send({ error: taken.email === email ? "This email is already registered" : "This username is taken" });
      }

      const user = await prisma!.user.create({
        data: {
          email,
          username,
          displayName: req.body.displayName?.trim() || null,
          passwordHash: await hashPassword(req.body.password),
          role: roleFor(email),
        },
      });
      await createSession(req, reply, user.id);
      return reply.code(201).send({ user: toAuthUser(user) });
    },
  );

  app.post<{ Body: { login: string; password: string } }>(
    "/login",
    {
      config: LOGIN_RATE_LIMIT,
      schema: {
        body: {
          type: "object",
          required: ["login", "password"],
          properties: {
            login: { type: "string", minLength: 1, maxLength: 200 },
            password: { type: "string", minLength: 1, maxLength: 200 },
          },
        },
      },
    },
    async (req, reply) => {
      const login = req.body.login.trim().toLowerCase();
      const user = await prisma!.user.findFirst({ where: { OR: [{ email: login }, { username: login }] } });
      if (user && !user.passwordHash) {
        return reply.code(400).send({ error: "This account uses Google sign-in. Continue with Google instead." });
      }
      if (!user || !(await verifyPassword(req.body.password, user.passwordHash!))) {
        return reply.code(401).send({ error: "Wrong email/username or password" });
      }

      const role = roleFor(user.email, user.role);
      const updated = role === user.role ? user : await prisma!.user.update({ where: { id: user.id }, data: { role } });
      await createSession(req, reply, user.id);
      return { user: toAuthUser(updated) };
    },
  );

  app.post("/logout", async (req, reply) => {
    await destroySession(req, reply);
    return { ok: true };
  });

  // ---------- Google ----------

  app.get("/google", async (_req, reply) => {
    if (!googleEnabled) return reply.code(404).send({ error: "Google sign-in is not configured" });
    const state = newState();
    reply.setCookie(OAUTH_STATE_COOKIE, state, cookieOptions(600));
    return reply.redirect(googleAuthUrl(state));
  });

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    "/google/callback",
    async (req, reply) => {
      const fail = (reason: string) => {
        req.log.warn({ reason }, "google sign-in failed");
        return reply.redirect(`/login?error=${encodeURIComponent(reason)}`);
      };
      const expectedState = req.cookies[OAUTH_STATE_COOKIE];
      reply.clearCookie(OAUTH_STATE_COOKIE, { path: "/" });

      if (!googleEnabled) return fail("Google sign-in is not configured");
      if (req.query.error) return fail("Google sign-in was cancelled");
      if (!req.query.code || !req.query.state || req.query.state !== expectedState) {
        return fail("Sign-in session expired, please try again");
      }

      let profile;
      try {
        profile = await exchangeCode(req.query.code);
      } catch (err) {
        req.log.error(err);
        return fail("Could not verify your Google account");
      }

      // ১) আগে Google দিয়ে লগইন করেছে  ২) একই ইমেইলে পাসওয়ার্ড অ্যাকাউন্ট আছে → যুক্ত করি  ৩) নতুন অ্যাকাউন্ট
      let user =
        (await prisma!.user.findUnique({ where: { googleId: profile.sub } })) ??
        (await prisma!.user.findUnique({ where: { email: profile.email } }));

      if (user) {
        const role = roleFor(user.email, user.role);
        if (user.googleId !== profile.sub || role !== user.role) {
          user = await prisma!.user.update({ where: { id: user.id }, data: { googleId: profile.sub, role } });
        }
      } else {
        user = await prisma!.user.create({
          data: {
            email: profile.email,
            username: await uniqueUsername(profile.email),
            displayName: profile.name?.slice(0, 60) || null,
            googleId: profile.sub,
            role: roleFor(profile.email),
          },
        });
      }

      await createSession(req, reply, user.id);
      return reply.redirect("/");
    },
  );
}

/** ইমেইলের প্রথম অংশ থেকে username, নেওয়া থাকলে শেষে সংখ্যা */
async function uniqueUsername(email: string): Promise<string> {
  let base = email
    .split("@")[0]!
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, "")
    .slice(0, 15);
  if (base.length < 3) base = `user${base}`;
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? base : `${base}${randomInt(10, 99999)}`;
    const exists = await prisma!.user.findUnique({ where: { username: candidate }, select: { id: true } });
    if (!exists) return candidate;
  }
  return `user${Date.now().toString(36)}`;
}
