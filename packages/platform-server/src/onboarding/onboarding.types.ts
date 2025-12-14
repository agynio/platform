export type OnboardingProfileData = {
  firstName: string;
  lastName: string;
  email: string;
};

export type OnboardingDataSnapshot = {
  profile: OnboardingProfileData | null;
};

export type OnboardingStatusResponse = {
  isComplete: boolean;
  requiredSteps: string[];
  completedSteps: string[];
  data: OnboardingDataSnapshot;
};

export type OnboardingProfileInput = OnboardingProfileData;

export type OnboardingStepContext = {
  appVersion: string;
  data: OnboardingDataSnapshot;
  completedSteps: Set<string>;
};

export type OnboardingStepDefinition = {
  stepId: string;
  introducedIn: string;
  isRequired(ctx: OnboardingStepContext): boolean;
  isFulfilled(ctx: OnboardingStepContext): boolean;
};
