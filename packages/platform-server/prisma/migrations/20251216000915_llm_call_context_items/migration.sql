CREATE TYPE "LLMCallContextItemDirection" AS ENUM ('input', 'output');

-- Ensure extension for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- CreateTable
CREATE TABLE "llm_call_context_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "llm_call_event_id" UUID NOT NULL,
    "context_item_id" UUID NOT NULL,
    "idx" INTEGER NOT NULL,
    "direction" "LLMCallContextItemDirection" NOT NULL,
    "is_new" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "llm_call_context_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "llm_call_context_items_llm_call_event_id_idx" ON "llm_call_context_items"("llm_call_event_id");

-- CreateIndex
CREATE INDEX "llm_call_context_items_context_item_id_idx" ON "llm_call_context_items"("context_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "llm_call_context_items_llm_call_event_id_idx_key" ON "llm_call_context_items"("llm_call_event_id", "idx");

-- AddForeignKey
ALTER TABLE "llm_call_context_items" ADD CONSTRAINT "llm_call_context_items_llm_call_event_id_fkey" FOREIGN KEY ("llm_call_event_id") REFERENCES "llm_calls"("event_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llm_call_context_items" ADD CONSTRAINT "llm_call_context_items_context_item_id_fkey" FOREIGN KEY ("context_item_id") REFERENCES "context_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
