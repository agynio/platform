-- CreateIndex
CREATE INDEX "Thread_parentId_idx" ON "Thread"("parentId");

-- Backfill parentId based on alias convention: parent__child (supports nested: a__b__c)
-- Set child.parentId to the id of the thread whose alias equals the substring before the last "__"
UPDATE "Thread" AS child
SET "parentId" = parent."id"
FROM "Thread" AS parent
WHERE child."alias" LIKE '%__%'
  AND parent."alias" = regexp_replace(child."alias", '^(.*)__(.*)$', '\1')
  AND child."parentId" IS NULL;
