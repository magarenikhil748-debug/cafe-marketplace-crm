-- CreateEnum
CREATE TYPE "BusinessType" AS ENUM (
  'CAFE',
  'RESTAURANT',
  'BAKERY',
  'CLOUD_KITCHEN',
  'TEA_SHOP',
  'JUICE_CENTER',
  'OTHER'
);

-- AlterTable
ALTER TABLE "restaurants"
ADD COLUMN "businessType" "BusinessType" NOT NULL DEFAULT 'CAFE';

-- AlterTable
ALTER TABLE "early_access_leads"
ADD COLUMN "restaurantId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "early_access_leads_restaurantId_key"
ON "early_access_leads"("restaurantId");

-- AddForeignKey
ALTER TABLE "early_access_leads"
ADD CONSTRAINT "early_access_leads_restaurantId_fkey"
FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
