-- AlterTable
ALTER TABLE "Thread" ADD COLUMN     "agent_config_snapshot" JSONB,
ADD COLUMN     "agent_node_id" UUID,
ADD COLUMN     "config_snapshot_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Thread_agent_node_id_idx" ON "Thread"("agent_node_id");

-- Best-effort backfill for agent_node_id using latest conversation state per thread (if nodeId is UUID)
WITH latest_states AS (
    SELECT DISTINCT ON ("threadId")
        "threadId",
        "nodeId"
    FROM "ConversationState"
    WHERE "nodeId" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ORDER BY "threadId", "updatedAt" DESC
)
UPDATE "Thread" AS t
SET "agent_node_id" = latest_states."nodeId"::uuid
FROM latest_states
WHERE t."agent_node_id" IS NULL
  AND t."id"::text = latest_states."threadId";
