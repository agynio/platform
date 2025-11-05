-- CreateEnum
CREATE TYPE "ThreadStatus" AS ENUM ('open', 'closed');

-- AlterTable: add columns summary and status
ALTER TABLE "Thread" ADD COLUMN "summary" TEXT;
ALTER TABLE "Thread" ADD COLUMN "status" "ThreadStatus" NOT NULL DEFAULT 'open';

-- No backfill of summary for existing rows per requirements

-- CreateIndex on status for filtering
CREATE INDEX "Thread_status_idx" ON "Thread"("status");
