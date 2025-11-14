-- Drop indexes that reference the ordinal column (guard for environments where they are already absent)
DROP INDEX IF EXISTS "run_events_run_id_ordinal_idx";
DROP INDEX IF EXISTS "run_events_run_id_type_ordinal_idx";
DROP INDEX IF EXISTS "run_events_run_id_ordinal_key";

-- Remove the ordinal column from run_events
ALTER TABLE "run_events" DROP COLUMN "ordinal";

-- Add a supporting index for ts/id ordering within a run
CREATE INDEX IF NOT EXISTS "run_events_run_id_ts_id_idx" ON "run_events"("run_id", "ts", "id");
