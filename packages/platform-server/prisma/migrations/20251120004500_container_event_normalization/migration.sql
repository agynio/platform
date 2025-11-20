-- Add dockerContainerId to Container and backfill from existing containerId
ALTER TABLE "Container" ADD COLUMN "dockerContainerId" TEXT;

UPDATE "Container"
SET "dockerContainerId" = "containerId"
WHERE "dockerContainerId" IS NULL;

ALTER TABLE "Container" ALTER COLUMN "dockerContainerId" SET NOT NULL;

CREATE UNIQUE INDEX "Container_dockerContainerId_key" ON "Container"("dockerContainerId");

-- Backfill missing threadId values from container events before dropping columns
UPDATE "Container" AS c
SET "threadId" = ce."threadId"
FROM "ContainerEvent" AS ce
WHERE c."id" = ce."containerDbId"
  AND ce."threadId" IS NOT NULL
  AND c."threadId" IS NULL;

-- Drop columns now stored on the parent Container
DROP INDEX IF EXISTS "ContainerEvent_dockerContainerId_createdAt_idx";
DROP INDEX IF EXISTS "ContainerEvent_threadId_createdAt_idx";

ALTER TABLE "ContainerEvent" DROP COLUMN "dockerContainerId";
ALTER TABLE "ContainerEvent" DROP COLUMN "threadId";
