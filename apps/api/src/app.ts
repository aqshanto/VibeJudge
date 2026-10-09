import Fastify from "fastify";
import cors from "@fastify/cors";
import type { HealthResponse } from "@vibejudge/shared";
import { prisma } from "./db.js";
import { env } from "./env.js";

export async function buildApp() {
  const app = Fastify({ logger: true });

  // Web সাধারণত Vercel rewrite দিয়ে একই ডোমেইন থেকে আসবে, তবু সরাসরি কলের জন্য CORS রাখা হলো।
  await app.register(cors, { origin: env.webOrigins, credentials: true });

  app.get("/api/health", async (): Promise<HealthResponse> => {
    let database: HealthResponse["database"] = "not_configured";
    if (prisma) {
      try {
        await prisma.$queryRaw`SELECT 1`;
        database = "connected";
      } catch (err) {
        app.log.error(err, "database health check failed");
        database = "error";
      }
    }

    return {
      status: database === "error" ? "degraded" : "ok",
      service: "vibejudge-api",
      version: env.version,
      time: new Date().toISOString(),
      database,
    };
  });

  return app;
}
