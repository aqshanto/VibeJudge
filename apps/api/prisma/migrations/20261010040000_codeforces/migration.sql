-- Codeforces: প্রবলেমের উৎস, অন্য OJ-এর সাবমিশন id, আর যাচাই করা handle
-- CreateEnum
CREATE TYPE "ProblemSource" AS ENUM ('LOCAL', 'CODEFORCES');

-- AlterTable
ALTER TABLE "problems" ADD COLUMN     "remoteId" TEXT,
ADD COLUMN     "source" "ProblemSource" NOT NULL DEFAULT 'LOCAL';

-- AlterTable
ALTER TABLE "submissions" ADD COLUMN     "remoteId" TEXT,
ADD COLUMN     "remoteLanguage" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "cfHandle" TEXT,
ADD COLUMN     "cfVerifyHandle" TEXT,
ADD COLUMN     "cfVerifyProblem" TEXT,
ADD COLUMN     "cfVerifyStartedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "problems_source_remoteId_key" ON "problems"("source", "remoteId");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_remoteId_key" ON "submissions"("remoteId");

-- CreateIndex
CREATE UNIQUE INDEX "users_cfHandle_key" ON "users"("cfHandle");

