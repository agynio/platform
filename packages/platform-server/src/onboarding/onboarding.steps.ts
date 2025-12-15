import { Injectable } from '@nestjs/common';
import type { OnboardingStepContext, OnboardingStepDefinition } from './onboarding.types';

export const PROFILE_BASIC_STEP_ID = 'profile.basic_v1';

function hasCompleteProfile(ctx: OnboardingStepContext): boolean {
  const profile = ctx.data.profile;
  if (!profile) return false;
  return Boolean(profile.firstName && profile.lastName && profile.email);
}

const profileBasicStep: OnboardingStepDefinition = {
  stepId: PROFILE_BASIC_STEP_ID,
  isRequired: () => true,
  isFulfilled: (ctx) => hasCompleteProfile(ctx),
};

@Injectable()
export class OnboardingStepsRegistry {
  private readonly steps: OnboardingStepDefinition[] = [profileBasicStep];

  list(): ReadonlyArray<OnboardingStepDefinition> {
    return this.steps;
  }
}
