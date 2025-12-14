-- CreateTable
CREATE TABLE "OnboardingState" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "profileFirstName" TEXT,
    "profileLastName" TEXT,
    "profileEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingStepCompletion" (
    "id" SERIAL NOT NULL,
    "stepId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data" JSONB,

    CONSTRAINT "OnboardingStepCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingStepCompletion_stepId_key" ON "OnboardingStepCompletion"("stepId");
