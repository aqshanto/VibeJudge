import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";
import { env } from "./env.js";

// DATABASE_URL না থাকলেও সার্ভার চালু হবে — শুধু health-এ "not_configured" দেখাবে।
export const prisma = env.databaseUrl
  ? new PrismaClient({ adapter: new PrismaPg({ connectionString: env.databaseUrl }) })
  : null;
