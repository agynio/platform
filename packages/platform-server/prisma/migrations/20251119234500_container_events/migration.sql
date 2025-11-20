-- CreateEnum
CREATE TYPE "ContainerEventType" AS ENUM ('oom', 'die', 'kill');

-- CreateTable
CREATE TABLE "ContainerEvent" (
    "id" SERIAL NOT NULL,
    "containerDbId" INTEGER NOT NULL,
    "dockerContainerId" TEXT NOT NULL,
    "threadId" UUID,
    "eventType" "ContainerEventType" NOT NULL,
    "exitCode" INTEGER,
    "signal" TEXT,
    "reason" TEXT,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContainerEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContainerEvent_containerDbId_createdAt_idx" ON "ContainerEvent"("containerDbId", "createdAt");

-- CreateIndex
CREATE INDEX "ContainerEvent_dockerContainerId_createdAt_idx" ON "ContainerEvent"("dockerContainerId", "createdAt");

-- CreateIndex
CREATE INDEX "ContainerEvent_threadId_createdAt_idx" ON "ContainerEvent"("threadId", "createdAt");

-- AddForeignKey
ALTER TABLE "ContainerEvent" ADD CONSTRAINT "ContainerEvent_containerDbId_fkey" FOREIGN KEY ("containerDbId") REFERENCES "Container"("id") ON DELETE CASCADE ON UPDATE CASCADE;

