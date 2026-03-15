-- CreateTable
CREATE TABLE "GraphVariable" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GraphVariable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GraphNodeState" (
    "id" SERIAL NOT NULL,
    "nodeId" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GraphNodeState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GraphVariable_key_key" ON "GraphVariable"("key");

-- CreateIndex
CREATE UNIQUE INDEX "GraphNodeState_nodeId_key" ON "GraphNodeState"("nodeId");
