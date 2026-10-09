import { buildApp } from "./app.js";
import { prisma } from "./db.js";
import { env } from "./env.js";
import { startCodeforcesTracker } from "./codeforces.js";

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
  // চলমান কনটেস্টে Codeforces-এর প্রবলেম থাকলে প্রতিযোগীদের সাবমিশন পালা করে আনে
  if (prisma) startCodeforcesTracker(app.log);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
