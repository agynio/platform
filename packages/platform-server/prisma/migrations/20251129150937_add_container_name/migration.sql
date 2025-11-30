-- Add the new column as nullable so existing records can be backfilled.
ALTER TABLE "Container" ADD COLUMN "name" TEXT;

-- Prefer explicit labels that may have been recorded during container creation.
UPDATE "Container"
SET "name" = NULLIF(trim(BOTH '/' FROM COALESCE(
  metadata -> 'labels' ->> 'hautech.ai/name',
  metadata ->> 'name',
  metadata ->> 'Name',
  metadata -> 'inspect' ->> 'Name',
  metadata -> 'docker' ->> 'Name',
  metadata -> 'container' ->> 'Name',
  metadata -> 'container' ->> 'name',
  metadata -> 'details' ->> 'Name',
  metadata -> 'details' ->> 'name'
)), '')
WHERE "name" IS NULL;

-- Fallback to a deterministic container identifier when no metadata provided a value.
UPDATE "Container"
SET "name" = substring("containerId" FROM 1 FOR 63)
WHERE "name" IS NULL;

-- Enforce the required constraint now that all rows are populated.
ALTER TABLE "Container" ALTER COLUMN "name" SET NOT NULL;
