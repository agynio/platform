-- Ensure pgcrypto is available for gen_random_uuid default
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Enum for memory scope (idempotent creation)
DO $$
BEGIN
  CREATE TYPE "MemoryScope" AS ENUM ('global', 'perThread');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- Base memories table definition (no-op if it already exists from runtime bootstrap)
CREATE TABLE IF NOT EXISTS "memories" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "node_id" TEXT NOT NULL,
  "scope" "MemoryScope" NOT NULL,
  "thread_id" TEXT NULL,
  "data" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "dirs" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Convert existing scope column to enum when upgrading from text + CHECK
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'memories'
      AND column_name = 'scope'
      AND udt_name <> 'MemoryScope'
  ) THEN
    ALTER TABLE "memories"
      ALTER COLUMN "scope" TYPE "MemoryScope"
      USING "scope"::text::"MemoryScope";
  END IF;
END
$$;

-- Ensure JSONB defaults and non-null constraints are enforced
ALTER TABLE "memories"
  ALTER COLUMN "data" SET DEFAULT '{}'::jsonb,
  ALTER COLUMN "data" SET NOT NULL,
  ALTER COLUMN "dirs" SET DEFAULT '{}'::jsonb,
  ALTER COLUMN "dirs" SET NOT NULL;

ALTER TABLE "memories"
  ALTER COLUMN "created_at" SET DEFAULT NOW(),
  ALTER COLUMN "updated_at" SET DEFAULT NOW();

-- Unique constraints for global and per-thread scopes
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_memories_global"
  ON "memories" ("node_id", "scope")
  WHERE "thread_id" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_memories_per_thread"
  ON "memories" ("node_id", "scope", "thread_id")
  WHERE "thread_id" IS NOT NULL;

-- Lookup index to aid fetches
CREATE INDEX IF NOT EXISTS "idx_memories_lookup"
  ON "memories" ("node_id", "scope");
