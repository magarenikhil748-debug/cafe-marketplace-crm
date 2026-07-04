-- Existing orders were created through QR flows, so the default safely backfills them as QR.
CREATE TYPE "OrderSource" AS ENUM ('QR', 'MANUAL');

ALTER TABLE "orders"
ADD COLUMN "source" "OrderSource" NOT NULL DEFAULT 'QR',
ALTER COLUMN "tableId" DROP NOT NULL;
