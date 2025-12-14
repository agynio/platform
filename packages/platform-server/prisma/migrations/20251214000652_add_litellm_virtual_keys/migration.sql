-- CreateTable
CREATE TABLE "litellm_virtual_keys" (
    "id" SERIAL NOT NULL,
    "alias" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "litellm_virtual_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "litellm_virtual_keys_alias_key" ON "litellm_virtual_keys"("alias");
