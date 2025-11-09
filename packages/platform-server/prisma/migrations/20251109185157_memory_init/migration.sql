-- CreateEnum
CREATE TYPE "MemoryScope" AS ENUM ('global', 'perThread');

-- CreateTable
CREATE TABLE "memories" (
    "id" UUID NOT NULL,
    "node_id" TEXT NOT NULL,
    "scope" "MemoryScope" NOT NULL,
    "thread_id" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "dirs" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_memories_lookup" ON "memories"("node_id", "scope");

-- Partial unique indexes for scope-specific uniqueness
CREATE UNIQUE INDEX "uniq_memories_global"
  ON "memories"("node_id", "scope")
  WHERE "thread_id" IS NULL;

CREATE UNIQUE INDEX "uniq_memories_per_thread"
  ON "memories"("node_id", "scope", "thread_id")
  WHERE "thread_id" IS NOT NULL;
