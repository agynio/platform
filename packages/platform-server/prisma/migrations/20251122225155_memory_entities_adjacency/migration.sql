/*
  Warnings:

  - You are about to drop the `memories` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "public"."memories";

-- CreateTable
CREATE TABLE "memory_entities" (
    "id" UUID NOT NULL,
    "parent_id" UUID,
    "node_id" TEXT NOT NULL,
    "thread_id" TEXT,
    "name" TEXT NOT NULL,
    "content" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memory_entities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_memory_entity_parent" ON "memory_entities"("node_id", "thread_id", "parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "uniq_memory_entity_path" ON "memory_entities"("node_id", "thread_id", "parent_id", "name");

-- AddForeignKey
ALTER TABLE "memory_entities" ADD CONSTRAINT "memory_entities_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "memory_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
