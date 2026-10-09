-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('PRIVATE', 'CONTEST', 'PUBLIC');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('c', 'cpp');

-- CreateEnum
CREATE TYPE "Verdict" AS ENUM ('PENDING', 'JUDGING', 'AC', 'WA', 'TLE', 'MLE', 'RE', 'CE', 'IE');

-- CreateTable
CREATE TABLE "problems" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "timeLimitMs" INTEGER NOT NULL DEFAULT 1000,
    "memoryLimitKb" INTEGER NOT NULL DEFAULT 262144,
    "checkerSource" TEXT,
    "visibility" "Visibility" NOT NULL DEFAULT 'PRIVATE',
    "dataVersion" INTEGER NOT NULL DEFAULT 1,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "problems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_cases" (
    "id" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "input" BYTEA NOT NULL,
    "answer" BYTEA NOT NULL,
    "isSample" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "test_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "userId" TEXT,
    "language" "Language" NOT NULL,
    "source" TEXT NOT NULL,
    "verdict" "Verdict" NOT NULL DEFAULT 'PENDING',
    "timeMs" INTEGER,
    "memoryKb" INTEGER,
    "compileOutput" TEXT,
    "testResults" JSONB,
    "workerName" TEXT,
    "claimToken" TEXT,
    "claimedAt" TIMESTAMP(3),
    "judgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "problems_slug_key" ON "problems"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "test_cases_problemId_ordinal_key" ON "test_cases"("problemId", "ordinal");

-- CreateIndex
CREATE INDEX "submissions_verdict_createdAt_idx" ON "submissions"("verdict", "createdAt");

-- CreateIndex
CREATE INDEX "submissions_problemId_createdAt_idx" ON "submissions"("problemId", "createdAt");

-- CreateIndex
CREATE INDEX "submissions_userId_createdAt_idx" ON "submissions"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "problems" ADD CONSTRAINT "problems_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
