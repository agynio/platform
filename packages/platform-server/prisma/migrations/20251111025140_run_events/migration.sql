-- CreateEnum
CREATE TYPE "RunEventType" AS ENUM ('invocation_message', 'injection', 'llm_call', 'tool_execution', 'summarization');

-- CreateEnum
CREATE TYPE "RunEventStatus" AS ENUM ('pending', 'running', 'success', 'error', 'cancelled');

-- CreateEnum
CREATE TYPE "EventSourceKind" AS ENUM ('internal', 'tracing', 'backfill');

-- CreateEnum
CREATE TYPE "ToolExecStatus" AS ENUM ('success', 'error');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('prompt', 'response', 'tool_input', 'tool_output', 'provider_raw', 'other');

-- Preserve existing defaults on memories table
ALTER TABLE "memories" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "memories" ALTER COLUMN "updated_at" SET DEFAULT NOW();

-- CreateTable
CREATE TABLE "run_events" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "type" "RunEventType" NOT NULL,
    "status" "RunEventStatus" NOT NULL DEFAULT 'success',
    "ordinal" INTEGER NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "node_id" TEXT,
    "source_kind" "EventSourceKind" NOT NULL DEFAULT 'internal',
    "source_span_id" TEXT,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "error_code" TEXT,
    "error_message" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "idempotency_key" TEXT,

    CONSTRAINT "run_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_messages" (
    "event_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "role" TEXT NOT NULL,

    CONSTRAINT "event_messages_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "llm_calls" (
    "event_id" UUID NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "temperature" DOUBLE PRECISION,
    "top_p" DOUBLE PRECISION,
    "stop_reason" TEXT,
    "prompt" TEXT,
    "response_text" TEXT,
    "raw_response" JSONB,

    CONSTRAINT "llm_calls_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "tool_calls" (
    "id" UUID NOT NULL,
    "llm_call_event_id" UUID NOT NULL,
    "call_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "arguments" JSONB NOT NULL,
    "idx" INTEGER NOT NULL,

    CONSTRAINT "tool_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tool_executions" (
    "event_id" UUID NOT NULL,
    "llm_call_event_id" UUID,
    "tool_name" TEXT NOT NULL,
    "tool_call_id" TEXT,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "exec_status" "ToolExecStatus" NOT NULL,
    "error_message" TEXT,
    "raw" JSONB,

    CONSTRAINT "tool_executions_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "summarizations" (
    "event_id" UUID NOT NULL,
    "old_context_tokens" INTEGER,
    "summary_text" TEXT NOT NULL,
    "new_context_count" INTEGER NOT NULL,
    "raw" JSONB,

    CONSTRAINT "summarizations_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "injections" (
    "event_id" UUID NOT NULL,
    "message_ids" UUID[],
    "reason" TEXT,

    CONSTRAINT "injections_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "event_attachments" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "kind" "AttachmentKind" NOT NULL,
    "content_json" JSONB,
    "content_text" TEXT,
    "is_gzip" BOOLEAN NOT NULL DEFAULT false,
    "size_bytes" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "event_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "run_events_idempotency_key_key" ON "run_events"("idempotency_key");

-- CreateIndex
CREATE INDEX "run_events_run_id_ordinal_idx" ON "run_events"("run_id", "ordinal");

-- CreateIndex
CREATE INDEX "run_events_run_id_type_ordinal_idx" ON "run_events"("run_id", "type", "ordinal");

-- CreateIndex
CREATE INDEX "run_events_run_id_ts_idx" ON "run_events"("run_id", "ts");

-- CreateIndex
CREATE INDEX "run_events_thread_id_ts_idx" ON "run_events"("thread_id", "ts");

-- CreateIndex
CREATE INDEX "run_events_source_kind_source_span_id_idx" ON "run_events"("source_kind", "source_span_id");

-- CreateIndex
CREATE UNIQUE INDEX "run_events_run_id_ordinal_key" ON "run_events"("run_id", "ordinal");

-- CreateIndex
CREATE INDEX "tool_calls_llm_call_event_id_idx_idx" ON "tool_calls"("llm_call_event_id", "idx");

-- CreateIndex
CREATE UNIQUE INDEX "tool_calls_llm_call_event_id_call_id_key" ON "tool_calls"("llm_call_event_id", "call_id");

-- CreateIndex
CREATE INDEX "tool_executions_llm_call_event_id_idx" ON "tool_executions"("llm_call_event_id");

-- CreateIndex
CREATE INDEX "tool_executions_tool_name_idx" ON "tool_executions"("tool_name");

-- CreateIndex
CREATE INDEX "event_attachments_event_id_idx" ON "event_attachments"("event_id");

-- AddForeignKey
ALTER TABLE "run_events" ADD CONSTRAINT "run_events_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_events" ADD CONSTRAINT "run_events_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "Thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_messages" ADD CONSTRAINT "event_messages_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "run_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_messages" ADD CONSTRAINT "event_messages_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "run_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_calls" ADD CONSTRAINT "tool_calls_llm_call_event_id_fkey" FOREIGN KEY ("llm_call_event_id") REFERENCES "llm_calls"("event_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_executions" ADD CONSTRAINT "tool_executions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "run_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_executions" ADD CONSTRAINT "tool_executions_llm_call_event_id_fkey" FOREIGN KEY ("llm_call_event_id") REFERENCES "llm_calls"("event_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "summarizations" ADD CONSTRAINT "summarizations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "run_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "injections" ADD CONSTRAINT "injections_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "run_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_attachments" ADD CONSTRAINT "event_attachments_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "run_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
