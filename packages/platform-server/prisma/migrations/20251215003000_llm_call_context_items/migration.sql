-- Ensure extension for UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- CreateEnum
CREATE TYPE "LLMCallContextItemPurpose" AS ENUM ('prompt_input', 'produced_tail');

-- CreateTable
CREATE TABLE "llm_call_context_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "llm_call_event_id" UUID NOT NULL,
    "context_item_id" UUID NOT NULL,
    "idx" INTEGER NOT NULL,
    "purpose" "LLMCallContextItemPurpose" NOT NULL,
    "is_new" BOOLEAN NOT NULL DEFAULT FALSE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT NOW(),

    CONSTRAINT "llm_call_context_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "llm_call_context_items_event_idx_key" ON "llm_call_context_items"("llm_call_event_id", "idx");

-- CreateIndex
CREATE INDEX "llm_call_context_items_event_id_idx" ON "llm_call_context_items"("llm_call_event_id");

-- CreateIndex
CREATE INDEX "llm_call_context_items_context_item_id_idx" ON "llm_call_context_items"("context_item_id");

-- AddForeignKey
ALTER TABLE "llm_call_context_items"
  ADD CONSTRAINT "llm_call_context_items_llm_call_event_id_fkey"
  FOREIGN KEY ("llm_call_event_id") REFERENCES "llm_calls"("event_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llm_call_context_items"
  ADD CONSTRAINT "llm_call_context_items_context_item_id_fkey"
  FOREIGN KEY ("context_item_id") REFERENCES "context_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill prompt inputs from existing array order
INSERT INTO "llm_call_context_items" (
  "llm_call_event_id",
  "context_item_id",
  "idx",
  "purpose",
  "is_new",
  "created_at"
)
SELECT
  lc."event_id",
  ctx_id::UUID,
  ord::INT - 1,
  'prompt_input'::"LLMCallContextItemPurpose",
  FALSE,
  COALESCE(re."ts", NOW())
FROM "llm_calls" lc
JOIN "run_events" re ON re."id" = lc."event_id"
CROSS JOIN LATERAL UNNEST(lc."context_item_ids") WITH ORDINALITY AS ctx(ctx_id, ord)
WHERE ctx_id IS NOT NULL AND ctx_id <> '';

-- Backfill produced tails after prompt inputs to preserve ordering
WITH prompt_counts AS (
  SELECT
    lc."event_id",
    COALESCE(array_length(lc."context_item_ids", 1), 0) AS prompt_length,
    lc."new_context_item_ids" AS tail_ids,
    re."ts" AS event_ts
  FROM "llm_calls" lc
  JOIN "run_events" re ON re."id" = lc."event_id"
)
INSERT INTO "llm_call_context_items" (
  "llm_call_event_id",
  "context_item_id",
  "idx",
  "purpose",
  "is_new",
  "created_at"
)
SELECT
  pc."event_id",
  ctx_id::UUID,
  pc.prompt_length + ord::INT - 1,
  'produced_tail'::"LLMCallContextItemPurpose",
  TRUE,
  COALESCE(pc.event_ts, NOW())
FROM prompt_counts pc
CROSS JOIN LATERAL UNNEST(pc.tail_ids) WITH ORDINALITY AS ctx(ctx_id, ord)
WHERE ctx_id IS NOT NULL AND ctx_id <> '';
