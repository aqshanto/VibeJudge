// Author হওয়ার আবেদন: USER আবেদন করে → ADMIN approve/reject করে।

import type { FastifyInstance } from "fastify";
import type { AuthorRequestView } from "@vibejudge/shared";
import { prisma } from "../db.js";
import { requireUser } from "../auth/guards.js";
import { invalidateUserSessions } from "../auth/session.js";

const USER_SELECT = { username: true, displayName: true, email: true } as const;

function toView(r: {
  id: string;
  message: string;
  status: AuthorRequestView["status"];
  createdAt: Date;
  reviewedAt: Date | null;
  user: AuthorRequestView["user"];
}): AuthorRequestView {
  return {
    id: r.id,
    message: r.message,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    user: r.user,
  };
}

export async function authorRoutes(app: FastifyInstance) {
  // আমার সর্বশেষ আবেদন (না থাকলে null)
  app.get("/author-requests/mine", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return reply;
    const r = await prisma!.authorRequest.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: { user: { select: USER_SELECT } },
    });
    return { request: r ? toView(r) : null };
  });

  app.post<{ Body: { message: string } }>(
    "/author-requests",
    {
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
      schema: {
        body: {
          type: "object",
          required: ["message"],
          properties: { message: { type: "string", minLength: 10, maxLength: 1000 } },
        },
      },
    },
    async (req, reply) => {
      const user = await requireUser(req, reply);
      if (!user) return reply;
      if (user.role !== "USER") return reply.code(409).send({ error: "You can already create problems" });

      const pending = await prisma!.authorRequest.findFirst({ where: { userId: user.id, status: "PENDING" } });
      if (pending) return reply.code(409).send({ error: "Your request is already waiting for review" });

      const r = await prisma!.authorRequest.create({
        data: { userId: user.id, message: req.body.message.trim() },
        include: { user: { select: USER_SELECT } },
      });
      return reply.code(201).send({ request: toView(r) });
    },
  );

  // ---------- Admin ----------

  app.get<{ Querystring: { status?: AuthorRequestView["status"] } }>(
    "/admin/author-requests",
    {
      schema: {
        querystring: {
          type: "object",
          properties: { status: { type: "string", enum: ["PENDING", "APPROVED", "REJECTED"] } },
        },
      },
    },
    async (req, reply) => {
      const admin = await requireUser(req, reply, ["ADMIN"]);
      if (!admin) return reply;
      const rows = await prisma!.authorRequest.findMany({
        where: { status: req.query.status ?? "PENDING" },
        orderBy: { createdAt: "asc" },
        take: 200,
        include: { user: { select: USER_SELECT } },
      });
      return { requests: rows.map(toView) };
    },
  );

  app.post<{ Params: { id: string; action: "approve" | "reject" } }>(
    "/admin/author-requests/:id/:action",
    {
      schema: {
        params: {
          type: "object",
          required: ["id", "action"],
          properties: { id: { type: "string" }, action: { type: "string", enum: ["approve", "reject"] } },
        },
      },
    },
    async (req, reply) => {
      const admin = await requireUser(req, reply, ["ADMIN"]);
      if (!admin) return reply;

      const request = await prisma!.authorRequest.findUnique({ where: { id: req.params.id } });
      if (!request) return reply.code(404).send({ error: "Request not found" });
      if (request.status !== "PENDING") return reply.code(409).send({ error: "This request was already reviewed" });

      const approve = req.params.action === "approve";
      await prisma!.$transaction(async (tx) => {
        await tx.authorRequest.update({
          where: { id: request.id },
          data: { status: approve ? "APPROVED" : "REJECTED", reviewedById: admin.id, reviewedAt: new Date() },
        });
        // শুধু USER → AUTHOR; ADMIN-কে নামিয়ে দিই না
        if (approve) await tx.user.updateMany({ where: { id: request.userId, role: "USER" }, data: { role: "AUTHOR" } });
      });
      invalidateUserSessions(request.userId);
      return { ok: true };
    },
  );
}
