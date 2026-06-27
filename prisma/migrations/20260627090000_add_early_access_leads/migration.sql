-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'REJECTED');

-- CreateTable
CREATE TABLE "early_access_leads" (
    "id" UUID NOT NULL,
    "cafeName" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "note" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "source" TEXT NOT NULL DEFAULT 'website',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "early_access_leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "early_access_leads_status_idx" ON "early_access_leads"("status");

-- CreateIndex
CREATE INDEX "early_access_leads_createdAt_idx" ON "early_access_leads"("createdAt");
