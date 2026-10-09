import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import type { HealthResponse } from "@vibejudge/shared";
import { prisma } from "./db.js";
import { env } from "./env.js";
import { authRoutes } from "./routes/auth.js";
import { authorProblemRoutes } from "./routes/author-problems.js";
import { authorRoutes } from "./routes/authors.js";
import { judgeRoutes } from "./routes/judge.js";
import { publicRoutes } from "./routes/public.js";

export async function buildApp() {
  // Vercel আর Render দুটোই proxy — আসল ইউজারের IP X-Forwarded-For-এ থাকে
  const app = Fastify({ logger: true, trustProxy: true });

  // Web সাধারণত Vercel rewrite দিয়ে একই ডোমেইন থেকে আসবে, তবু সরাসরি কলের জন্য CORS রাখা হলো।
  await app.register(cors, { origin: env.webOrigins, credentials: true });
  // rate-limit-এর আগে, যাতে keyGenerator কুকি পড়তে পারে
  await app.register(cookie);
  // শুধু যেসব route-এ config.rateLimit দেওয়া আছে সেগুলোতে
  await app.register(rateLimit, { global: false });

  // ?db=1 দিলে DB-ও চেক করে। Render-এর নিয়মিত health check DB ছোঁয় না,
  // নাহলে Neon কখনো ঘুমাতে পারত না (ফ্রি compute ঘণ্টা শেষ হয়ে যেত)।
  app.get<{ Querystring: { db?: string } }>("/api/health", async (req): Promise<HealthResponse> => {
    let database: HealthResponse["database"] = "not_configured";
    if (prisma && req.query.db === "1") {
      try {
        await prisma.$queryRaw`SELECT 1`;
        database = "connected";
      } catch (err) {
        app.log.error(err, "database health check failed");
        database = "error";
      }
    } else if (prisma) {
      database = "not_checked";
    }

    return {
      status: database === "error" ? "degraded" : "ok",
      service: "vibejudge-api",
      version: env.version,
      time: new Date().toISOString(),
      database,
    };
  });

  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(authorRoutes, { prefix: "/api" });
  await app.register(authorProblemRoutes, { prefix: "/api/author" });
  await app.register(publicRoutes, { prefix: "/api" });
  await app.register(judgeRoutes, { prefix: "/api/judge" });

  return app;
}
