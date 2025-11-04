-- CreateTable
CREATE TABLE "Reminder" (
    "id" UUID NOT NULL,
    "threadId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reminder_threadId_idx" ON "Reminder"("threadId");

