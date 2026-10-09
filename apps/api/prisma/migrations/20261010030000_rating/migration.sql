-- Rating: ব্যবহারকারীর rating/সর্বোচ্চ, কনটেস্টে কখন লাগানো হলো, আর প্রতিটা পরিবর্তনের ইতিহাস
-- AlterTable
ALTER TABLE "contests" ADD COLUMN     "ratedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "maxRating" INTEGER,
ADD COLUMN     "rating" INTEGER;

-- CreateTable
CREATE TABLE "rating_changes" (
    "id" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "oldRating" INTEGER NOT NULL,
    "newRating" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rating_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rating_changes_userId_idx" ON "rating_changes"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "rating_changes_contestId_userId_key" ON "rating_changes"("contestId", "userId");

-- AddForeignKey
ALTER TABLE "rating_changes" ADD CONSTRAINT "rating_changes_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "contests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rating_changes" ADD CONSTRAINT "rating_changes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

