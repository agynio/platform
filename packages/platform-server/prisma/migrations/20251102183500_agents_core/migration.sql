-- Create PostgreSQL enum types
DO $$ BEGIN
  CREATE TYPE "RunStatus" AS ENUM ('running', 'finished', 'terminated');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "MessageKind" AS ENUM ('user', 'assistant', 'system', 'tool');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "RunMessageType" AS ENUM ('input', 'injected', 'output');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Threads
CREATE TABLE IF NOT EXISTS "Thread" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "parentId" UUID,
  "alias" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Thread_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Thread_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Thread"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "Thread_alias_key" ON "Thread"("alias");

-- Runs
CREATE TABLE IF NOT EXISTS "Run" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "threadId" UUID NOT NULL,
  "status" "RunStatus" NOT NULL DEFAULT 'running',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Run_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Run_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Run_threadId_idx" ON "Run"("threadId");

-- Messages
CREATE TABLE IF NOT EXISTS "Message" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "kind" "MessageKind" NOT NULL,
  "text" TEXT,
  "source" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- RunMessage (join table)
CREATE TABLE IF NOT EXISTS "RunMessage" (
  "runId" UUID NOT NULL,
  "messageId" UUID NOT NULL,
  "type" "RunMessageType" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RunMessage_pkey" PRIMARY KEY ("runId", "messageId"),
  CONSTRAINT "RunMessage_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RunMessage_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "RunMessage_runId_idx" ON "RunMessage"("runId");

