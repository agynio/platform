-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "oidcIssuer" TEXT,
    "oidcSubject" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- Insert default single-user principal (id is deterministic for server fallback)
INSERT INTO "User" ("id", "email", "name", "createdAt", "updatedAt")
VALUES ('00000000-0000-0000-0000-000000000001', 'default@local', 'Default User', NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;

-- AlterTable: add ownerUserId nullable first for backfill
ALTER TABLE "Thread" ADD COLUMN     "ownerUserId" UUID;

-- Backfill existing threads to default user
UPDATE "Thread"
SET "ownerUserId" = COALESCE("ownerUserId", '00000000-0000-0000-0000-000000000001');

-- Enforce NOT NULL after backfill
ALTER TABLE "Thread" ALTER COLUMN "ownerUserId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_oidcIssuer_oidcSubject_key" ON "User"("oidcIssuer", "oidcSubject");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Thread_ownerUserId_idx" ON "Thread"("ownerUserId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Thread" ADD CONSTRAINT "Thread_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
