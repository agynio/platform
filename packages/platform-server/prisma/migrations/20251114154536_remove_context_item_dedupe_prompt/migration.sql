/*
  Warnings:

  - You are about to drop the column `sha256` on the `context_items` table. All the data in the column will be lost.
  - You are about to drop the column `prompt` on the `llm_calls` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "public"."uniq_ctxitem_dedup";

-- AlterTable
ALTER TABLE "context_items" DROP COLUMN "sha256";

-- AlterTable
ALTER TABLE "llm_calls" DROP COLUMN "prompt";
