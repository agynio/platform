DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'run_events'
  ) THEN
    -- Drop indexes that reference the ordinal column (guard for environments where they are already absent)
    EXECUTE 'DROP INDEX IF EXISTS "run_events_run_id_ordinal_idx"';
    EXECUTE 'DROP INDEX IF EXISTS "run_events_run_id_type_ordinal_idx"';
    EXECUTE 'DROP INDEX IF EXISTS "run_events_run_id_ordinal_key"';

    -- Remove the ordinal column from run_events
    EXECUTE 'ALTER TABLE "run_events" DROP COLUMN IF EXISTS "ordinal"';

    -- Add a supporting index for ts/id ordering within a run
    EXECUTE 'CREATE INDEX IF NOT EXISTS "run_events_run_id_ts_id_idx" ON "run_events"("run_id", "ts", "id")';
  END IF;
END $$;
