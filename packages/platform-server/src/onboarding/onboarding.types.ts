import type { UserProfileData } from '../user-profile/user-profile.types';

export type OnboardingProfileData = UserProfileData;

export type OnboardingDataSnapshot = {
  profile: OnboardingProfileData | null;
};

export type OnboardingStatusResponse = {
  isComplete: boolean;
  requiredSteps: string[];
  completedSteps: string[];
  data: OnboardingDataSnapshot;
};

export type OnboardingStepContext = {
  data: OnboardingDataSnapshot;
};

export type OnboardingStepDefinition = {
  stepId: string;
  isRequired(ctx: OnboardingStepContext): boolean;
  isFulfilled(ctx: OnboardingStepContext): boolean;
};
