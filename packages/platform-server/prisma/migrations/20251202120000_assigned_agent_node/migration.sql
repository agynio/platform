-- AlterTable
ALTER TABLE "Thread" ADD COLUMN     "assigned_agent_node_id" UUID;

-- CreateIndex
CREATE INDEX "Thread_assigned_agent_node_id_idx" ON "Thread"("assigned_agent_node_id");
