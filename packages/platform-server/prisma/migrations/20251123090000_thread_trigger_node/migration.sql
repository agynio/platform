-- Add trigger_node_id column to Thread for associating threads with trigger nodes.
ALTER TABLE "Thread" ADD COLUMN IF NOT EXISTS "trigger_node_id" UUID;
