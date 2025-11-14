/*
  Warnings:

  - You are about to drop the column `ordinal` on the `run_events` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "public"."run_events_run_id_ordinal_idx";

-- DropIndex
DROP INDEX "public"."run_events_run_id_ordinal_key";

-- DropIndex
DROP INDEX "public"."run_events_run_id_type_ordinal_idx";

-- AlterTable
ALTER TABLE "run_events" DROP COLUMN "ordinal";

-- CreateIndex
CREATE INDEX "run_events_run_id_ts_id_idx" ON "run_events"("run_id", "ts", "id");
