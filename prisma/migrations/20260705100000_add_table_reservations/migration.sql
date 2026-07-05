CREATE TYPE "ReservationStatus" AS ENUM (
  'REQUESTED',
  'CONFIRMED',
  'DECLINED',
  'CANCELLED',
  'SEATED',
  'NO_SHOW'
);

CREATE TYPE "ReservationSource" AS ENUM (
  'PUBLIC_PROFILE',
  'OWNER_CREATED',
  'ADMIN_CREATED'
);

CREATE TABLE "reservation_offers" (
  "id" UUID NOT NULL,
  "restaurantId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "terms" TEXT,
  "minGuests" INTEGER,
  "validFrom" TIMESTAMP(3),
  "validUntil" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "reservation_offers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reservations" (
  "id" UUID NOT NULL,
  "restaurantId" UUID NOT NULL,
  "branchId" UUID,
  "offerId" UUID,
  "customerName" TEXT NOT NULL,
  "customerPhone" TEXT NOT NULL,
  "customerEmail" TEXT,
  "partySize" INTEGER NOT NULL,
  "reservationDateTime" TIMESTAMP(3) NOT NULL,
  "occasion" TEXT,
  "specialRequest" TEXT,
  "ownerNote" TEXT,
  "status" "ReservationStatus" NOT NULL DEFAULT 'REQUESTED',
  "source" "ReservationSource" NOT NULL DEFAULT 'PUBLIC_PROFILE',
  "confirmedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "seatedAt" TIMESTAMP(3),
  "declinedAt" TIMESTAMP(3),
  "noShowAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "reservation_offers_restaurantId_idx" ON "reservation_offers"("restaurantId");
CREATE INDEX "reservation_offers_restaurantId_isActive_idx" ON "reservation_offers"("restaurantId", "isActive");
CREATE INDEX "reservation_offers_validFrom_validUntil_idx" ON "reservation_offers"("validFrom", "validUntil");
CREATE INDEX "reservations_restaurantId_idx" ON "reservations"("restaurantId");
CREATE INDEX "reservations_branchId_idx" ON "reservations"("branchId");
CREATE INDEX "reservations_offerId_idx" ON "reservations"("offerId");
CREATE INDEX "reservations_restaurantId_status_idx" ON "reservations"("restaurantId", "status");
CREATE INDEX "reservations_restaurantId_reservationDateTime_idx" ON "reservations"("restaurantId", "reservationDateTime");

ALTER TABLE "reservation_offers"
ADD CONSTRAINT "reservation_offers_restaurantId_fkey"
FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reservations"
ADD CONSTRAINT "reservations_restaurantId_fkey"
FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reservations"
ADD CONSTRAINT "reservations_branchId_fkey"
FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "reservations"
ADD CONSTRAINT "reservations_offerId_fkey"
FOREIGN KEY ("offerId") REFERENCES "reservation_offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
