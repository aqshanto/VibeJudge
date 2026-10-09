/*
  Warnings:

  - Added the required column `endsAt` to the `contests` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "contests" ADD COLUMN     "endsAt" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE INDEX "contests_endsAt_idx" ON "contests"("endsAt");
