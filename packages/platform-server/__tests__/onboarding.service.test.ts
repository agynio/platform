import { describe, expect, it, beforeEach } from 'vitest';
import type { OnboardingState, OnboardingStepCompletion, PrismaClient } from '@prisma/client';
import { OnboardingService } from '../src/onboarding/onboarding.service';
import { OnboardingStepsRegistry } from '../src/onboarding/onboarding.steps';
import type { PrismaService } from '../src/core/services/prisma.service';

class FakePrismaClient {
  private state: OnboardingState | null = null;
  private completionSeq = 0;
  private completions = new Map<string, OnboardingStepCompletion>();

  onboardingState = {
    findUnique: async () => (this.state ? { ...this.state } : null),
    upsert: async ({ create, update }: { create: Partial<OnboardingState>; update: Partial<OnboardingState> }) => {
      if (!this.state) {
        this.state = {
          id: typeof create.id === 'number' ? create.id : 1,
          profileFirstName: (create.profileFirstName ?? null) as string | null,
          profileLastName: (create.profileLastName ?? null) as string | null,
          profileEmail: (create.profileEmail ?? null) as string | null,
          createdAt: new Date(),
          updatedAt: new Date(),
        } satisfies OnboardingState;
      } else {
        this.state = {
          ...this.state,
          profileFirstName: (update.profileFirstName ?? this.state.profileFirstName) as string | null,
          profileLastName: (update.profileLastName ?? this.state.profileLastName) as string | null,
          profileEmail: (update.profileEmail ?? this.state.profileEmail) as string | null,
          updatedAt: new Date(),
        } satisfies OnboardingState;
      }
      return { ...this.state };
    },
  };

  onboardingStepCompletion = {
    findMany: async () => Array.from(this.completions.values()).map((item) => ({ ...item })),
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { stepId: string };
      create: Partial<OnboardingStepCompletion>;
      update: Partial<OnboardingStepCompletion>;
    }) => {
      const existing = this.completions.get(where.stepId);
      if (!existing) {
        const created: OnboardingStepCompletion = {
          id: ++this.completionSeq,
          stepId: where.stepId,
          completedAt: new Date(),
          data: create.data ?? null,
        };
        this.completions.set(where.stepId, created);
        return { ...created };
      }
      const next: OnboardingStepCompletion = {
        ...existing,
        completedAt: update.completedAt ?? new Date(),
        data: update.data ?? existing.data,
      };
      this.completions.set(where.stepId, next);
      return { ...next };
    },
  };
}

class FakePrismaService implements Pick<PrismaService, 'getClient'> {
  constructor(private readonly client: FakePrismaClient) {}

  getClient(): PrismaClient {
    return this.client as unknown as PrismaClient;
  }
}

describe('OnboardingService', () => {
  let prisma: FakePrismaClient;
  let service: OnboardingService;

  beforeEach(() => {
    prisma = new FakePrismaClient();
    service = new OnboardingService(
      new FakePrismaService(prisma) as unknown as PrismaService,
      new OnboardingStepsRegistry(),
    );
  });

  it('requires profile step when no data exists', async () => {
    const status = await service.getStatus('1.0.0');
    expect(status.isComplete).toBe(false);
    expect(status.requiredSteps).toEqual(['profile.basic_v1']);
    expect(status.completedSteps).toEqual([]);
    expect(status.data.profile).toBeNull();
  });

  it('skips steps introduced after current app version', async () => {
    const status = await service.getStatus('0.9.0');
    expect(status.isComplete).toBe(true);
    expect(status.requiredSteps).toEqual([]);
    expect(status.completedSteps).toEqual([]);
  });

  it('persists profile data and marks step complete', async () => {
    await service.saveProfile({ firstName: ' Casey ', lastName: ' Brooks ', email: 'CASEY@EXAMPLE.COM ' });
    const status = await service.getStatus('1.2.0');
    expect(status.isComplete).toBe(true);
    expect(status.completedSteps).toEqual(['profile.basic_v1']);
    expect(status.data.profile).toEqual({ firstName: 'Casey', lastName: 'Brooks', email: 'casey@example.com' });
  });
});
