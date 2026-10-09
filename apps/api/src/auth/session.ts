// Session: কুকিতে random টোকেন, DB-তে তার SHA-256 (DB ফাঁস হলেও টোকেন বের করা যাবে না)।
// প্রতি request-এ DB না ছুঁতে ৩০ সেকেন্ডের ছোট memory cache আছে।

import { createHash, randomBytes } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AuthUser, Role } from "@vibejudge/shared";
import { prisma } from "../db.js";
import { env } from "../env.js";

export const SESSION_COOKIE = "vj_session";
const SESSION_DAYS = 30;
const CACHE_TTL_MS = 30_000;

const cache = new Map<string, { user: AuthUser | null; at: number }>();

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function toAuthUser(u: {
  id: string;
  username: string;
  displayName: string | null;
  email: string;
  role: Role;
}): AuthUser {
  return { id: u.id, username: u.username, displayName: u.displayName, email: u.email, role: u.role };
}

export function cookieOptions(maxAgeSec: number) {
  return {
    path: "/",
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: "lax" as const,
    maxAge: maxAgeSec,
  };
}

export async function createSession(req: FastifyRequest, reply: FastifyReply, userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  await prisma!.session.create({
    data: {
      id: hashToken(token),
      userId,
      expiresAt: new Date(Date.now() + SESSION_DAYS * 86400_000),
      userAgent: req.headers["user-agent"]?.slice(0, 300),
    },
  });
  reply.setCookie(SESSION_COOKIE, token, cookieOptions(SESSION_DAYS * 86400));
}

export async function destroySession(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = req.cookies[SESSION_COOKIE];
  if (token) {
    const id = hashToken(token);
    cache.delete(id);
    await prisma!.session.deleteMany({ where: { id } });
  }
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
}

/** কুকি থেকে লগইন করা ইউজার (না থাকলে null) */
export async function getSessionUser(req: FastifyRequest): Promise<AuthUser | null> {
  const token = req.cookies[SESSION_COOKIE];
  if (!token || !prisma) return null;
  const id = hashToken(token);

  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.user;

  const session = await prisma.session.findUnique({ where: { id }, include: { user: true } });
  let user: AuthUser | null = null;
  if (session && session.expiresAt > new Date()) {
    user = toAuthUser(session.user);
  } else if (session) {
    await prisma.session.delete({ where: { id } }).catch(() => {});
  }
  if (cache.size > 10_000) cache.clear();
  cache.set(id, { user, at: Date.now() });
  return user;
}

/** রোল বদলালে বা ইউজার মুছলে cache থেকে তার সব session বাদ দাও */
export function invalidateUserSessions(userId: string): void {
  for (const [id, entry] of cache) if (entry.user?.id === userId) cache.delete(id);
}

/**
 * পাসওয়ার্ড বদলালে/রিসেট করলে: ইউজারের সব লগইন বাতিল (DB + cache)।
 * `keep` দিলে এই request-এর session থাকে (নিজে বদলালে যেন নিজেই লগআউট না হয়)।
 */
export async function revokeSessions(userId: string, keep?: FastifyRequest): Promise<number> {
  const token = keep?.cookies[SESSION_COOKIE];
  const keepId = token ? hashToken(token) : undefined;
  const res = await prisma!.session.deleteMany({ where: { userId, ...(keepId ? { id: { not: keepId } } : {}) } });
  for (const [id, entry] of cache) if (entry.user?.id === userId && id !== keepId) cache.delete(id);
  return res.count;
}
