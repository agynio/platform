-- CreateEnum
CREATE TYPE "ContextItemRole" AS ENUM ('system', 'user', 'assistant', 'tool', 'memory', 'summary', 'other');

-- AlterTable
ALTER TABLE "llm_calls" ADD COLUMN     "context_item_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "context_items" (
    "id" UUID NOT NULL,
    "role" "ContextItemRole" NOT NULL,
    "contentText" TEXT,
    "content_json" JSONB,
    "metadata" JSONB DEFAULT '{}',
    "size_bytes" INTEGER NOT NULL DEFAULT 0,
    "sha256" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "context_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_context_items_role" ON "context_items"("role");

-- CreateIndex
CREATE UNIQUE INDEX "uniq_ctxitem_dedup" ON "context_items"("sha256", "role");
