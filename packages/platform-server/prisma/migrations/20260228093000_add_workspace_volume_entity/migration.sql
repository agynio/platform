-- Ensure extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateTable
CREATE TABLE "workspace_volumes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "thread_id" UUID NOT NULL,
    "volume_name" TEXT NOT NULL,
    "removed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
    CONSTRAINT "workspace_volumes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workspace_volumes_volume_name_key" ON "workspace_volumes"("volume_name");
CREATE INDEX "workspace_volumes_thread_id_idx" ON "workspace_volumes"("thread_id");
CREATE INDEX "workspace_volumes_removed_at_idx" ON "workspace_volumes"("removed_at");
CREATE INDEX "workspace_volumes_thread_id_removed_at_idx" ON "workspace_volumes"("thread_id", "removed_at");

-- Partial unique index to enforce a single active volume per thread
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_volumes_thread_id_active_unique"
  ON "workspace_volumes"("thread_id")
  WHERE "removed_at" IS NULL;

-- AddForeignKey
ALTER TABLE "workspace_volumes"
  ADD CONSTRAINT "workspace_volumes_thread_id_fkey"
  FOREIGN KEY ("thread_id") REFERENCES "Thread"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
