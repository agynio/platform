-- CreateTable
CREATE TABLE "ConversationState" (
    "id" SERIAL NOT NULL,
    "threadId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConversationState_threadId_nodeId_key" ON "ConversationState"("threadId", "nodeId");
