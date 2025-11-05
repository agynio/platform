-- CreateEnum
CREATE TYPE "ProviderType" AS ENUM ('docker');

-- CreateEnum
CREATE TYPE "ContainerStatus" AS ENUM ('running', 'stopped', 'terminating', 'failed');

-- CreateTable
CREATE TABLE "Container" (
    "id" SERIAL NOT NULL,
    "containerId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "threadId" UUID,
    "providerType" "ProviderType" NOT NULL DEFAULT 'docker',
    "image" TEXT NOT NULL,
    "status" "ContainerStatus" NOT NULL DEFAULT 'running',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3) NOT NULL,
    "killAfterAt" TIMESTAMP(3),
    "terminationReason" TEXT,
    "deletedAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "Container_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Container_containerId_key" ON "Container"("containerId");

-- CreateIndex
CREATE INDEX "Container_status_killAfterAt_idx" ON "Container"("status", "killAfterAt");

-- CreateIndex
CREATE INDEX "Container_nodeId_status_lastUsedAt_idx" ON "Container"("nodeId", "status", "lastUsedAt");

-- AddForeignKey
ALTER TABLE "Container" ADD CONSTRAINT "Container_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE SET NULL ON UPDATE CASCADE;

