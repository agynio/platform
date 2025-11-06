-- Add ttlSeconds typed column with default 86400 seconds (24h)
ALTER TABLE "Container" ADD COLUMN "ttlSeconds" INTEGER NOT NULL DEFAULT 86400;

