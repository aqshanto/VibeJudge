-- Window contest (প্রত্যেকে নিজের সময়ে শুরু) আর virtual participation
CREATE TYPE "ContestType" AS ENUM ('FIXED', 'WINDOW');
ALTER TABLE "contests" ADD COLUMN "type" "ContestType" NOT NULL DEFAULT 'FIXED';

ALTER TABLE "contest_participants" ADD COLUMN "startedAt" TIMESTAMP(3);
ALTER TABLE "contest_participants" ADD COLUMN "virtual" BOOLEAN NOT NULL DEFAULT false;
