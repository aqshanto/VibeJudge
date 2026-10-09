import { buildApp } from "./app.js";
import { prisma } from "./db.js";
import { env } from "./env.js";

const app = await buildApp();

const shutdown = async () => {
  await app.close();
  await prisma?.$disconnect();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

try {
  await app.listen({ port: env.port, host: env.host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
