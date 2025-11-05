-- Migration: convert Reminder.threadId to UUID and clean table
-- Note: Reminder records are ephemeral; delete existing to avoid invalid casts
DELETE FROM "Reminder";
ALTER TABLE "Reminder" ALTER COLUMN "threadId" TYPE UUID USING ("threadId"::uuid);
