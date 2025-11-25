-- AlterTable
ALTER TABLE "Thread"
ADD COLUMN     "model_used" TEXT,
ADD COLUMN     "model_snapshotted_at" TIMESTAMP(3);
