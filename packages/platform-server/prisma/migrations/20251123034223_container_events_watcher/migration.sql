/*
  Warnings:

  - A unique constraint covering the columns `[dockerContainerId]` on the table `Container` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `dockerContainerId` to the `Container` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ContainerEventType" AS ENUM ('oom', 'die', 'kill');

-- AlterTable
ALTER TABLE "Container" ADD COLUMN     "dockerContainerId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "ContainerEvent" (
    "id" SERIAL NOT NULL,
    "containerDbId" INTEGER NOT NULL,
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
CREATE UNIQUE INDEX "Container_dockerContainerId_key" ON "Container"("dockerContainerId");

-- AddForeignKey
ALTER TABLE "ContainerEvent" ADD CONSTRAINT "ContainerEvent_containerDbId_fkey" FOREIGN KEY ("containerDbId") REFERENCES "Container"("id") ON DELETE CASCADE ON UPDATE CASCADE;
