import type { FastifyReply, FastifyRequest } from "fastify";
import type { AuthUser, Role } from "@vibejudge/shared";
import { getSessionUser } from "./session.js";

/**
 * লগইন না থাকলে (বা রোল না মিললে) error পাঠিয়ে null ফেরত দেয়।
 * ব্যবহার: `const user = await requireUser(req, reply); if (!user) return reply;`
 */
export async function requireUser(
  req: FastifyRequest,
  reply: FastifyReply,
  roles?: readonly Role[],
): Promise<AuthUser | null> {
  const user = await getSessionUser(req);
  if (!user) {
    reply.code(401).send({ error: "Please log in first" });
    return null;
  }
  if (roles && !roles.includes(user.role)) {
    reply.code(403).send({ error: "You don't have permission to do this" });
    return null;
  }
  return user;
}
