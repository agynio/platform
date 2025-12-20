-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ContainerEventType" ADD VALUE 'create';
ALTER TYPE "ContainerEventType" ADD VALUE 'start';
ALTER TYPE "ContainerEventType" ADD VALUE 'stop';
ALTER TYPE "ContainerEventType" ADD VALUE 'destroy';
ALTER TYPE "ContainerEventType" ADD VALUE 'restart';
ALTER TYPE "ContainerEventType" ADD VALUE 'health_status';

-- AlterTable
ALTER TABLE "ContainerEvent" ADD COLUMN     "health" TEXT;
