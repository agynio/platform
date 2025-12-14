import { Inject, Injectable } from '@nestjs/common';
import type { OnboardingState as OnboardingStateModel, PrismaClient } from '@prisma/client';
import semver from 'semver';
import { PrismaService } from '../core/services/prisma.service';
import { OnboardingStepsRegistry, PROFILE_BASIC_STEP_ID } from './onboarding.steps';
import type {
  OnboardingDataSnapshot,
  OnboardingProfileData,
  OnboardingProfileInput,
  OnboardingStatusResponse,
  OnboardingStepContext,
} from './onboarding.types';

const ONBOARDING_SINGLETON_ID = 1;

type LoadedState = {
  snapshot: OnboardingDataSnapshot;
  completedSteps: Set<string>;
};

@Injectable()
export class OnboardingService {
  constructor(
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(OnboardingStepsRegistry) private readonly stepsRegistry: OnboardingStepsRegistry,
  ) {}

  private get prisma(): PrismaClient {
    return this.prismaService.getClient();
  }

  async getStatus(appVersion: string): Promise<OnboardingStatusResponse> {
    const loaded = await this.loadState();
    return this.computeStatus(appVersion, loaded);
  }

  async saveProfile(input: OnboardingProfileInput): Promise<OnboardingDataSnapshot> {
    const normalized = this.normalizeProfileInput(input);
    const record = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.onboardingState.upsert({
        where: { id: ONBOARDING_SINGLETON_ID },
        create: {
          id: ONBOARDING_SINGLETON_ID,
          profileFirstName: normalized.firstName,
          profileLastName: normalized.lastName,
          profileEmail: normalized.email,
        },
        update: {
          profileFirstName: normalized.firstName,
          profileLastName: normalized.lastName,
          profileEmail: normalized.email,
        },
      });

      await tx.onboardingStepCompletion.upsert({
        where: { stepId: PROFILE_BASIC_STEP_ID },
        create: {
          stepId: PROFILE_BASIC_STEP_ID,
          data: normalized,
        },
        update: {
          data: normalized,
          completedAt: new Date(),
        },
      });

      return updated;
    });

    return { profile: this.mapProfile(record) };
  }

  private async loadState(): Promise<LoadedState> {
    const prisma = this.prisma;
    const [state, completions] = await Promise.all([
      prisma.onboardingState.findUnique({ where: { id: ONBOARDING_SINGLETON_ID } }),
      prisma.onboardingStepCompletion.findMany(),
    ]);

    return {
      snapshot: { profile: this.mapProfile(state) },
      completedSteps: new Set(completions.map((item) => item.stepId)),
    };
  }

  private computeStatus(appVersion: string, loaded: LoadedState): OnboardingStatusResponse {
    const steps = this.stepsRegistry.list();
    const requiredSteps: string[] = [];
    const completedSteps: string[] = [];

    const context: OnboardingStepContext = {
      appVersion,
      data: loaded.snapshot,
      completedSteps: loaded.completedSteps,
    };

    for (const step of steps) {
      if (!semver.gte(appVersion, step.introducedIn)) continue;

      const fulfilled = step.isFulfilled(context);
      if (fulfilled) {
        completedSteps.push(step.stepId);
        continue;
      }

      if (step.isRequired(context)) {
        requiredSteps.push(step.stepId);
      }
    }

    return {
      isComplete: requiredSteps.length === 0,
      requiredSteps,
      completedSteps,
      data: loaded.snapshot,
    };
  }

  private mapProfile(record: OnboardingStateModel | null): OnboardingProfileData | null {
    if (!record) return null;
    const firstName = (record.profileFirstName ?? '').trim();
    const lastName = (record.profileLastName ?? '').trim();
    const email = (record.profileEmail ?? '').trim();
    if (!firstName && !lastName && !email) return null;
    return { firstName, lastName, email };
  }

  private normalizeProfileInput(input: OnboardingProfileInput): OnboardingProfileInput {
    return {
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email: input.email.trim().toLowerCase(),
    };
  }
}
