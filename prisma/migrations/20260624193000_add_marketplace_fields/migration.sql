-- AlterTable
ALTER TABLE "restaurants"
ADD COLUMN "description" TEXT,
ADD COLUMN "imageUrl" TEXT,
ADD COLUMN "isApproved" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "restaurants_isActive_isApproved_idx"
ON "restaurants"("isActive", "isApproved");
