import { asData, http } from '@/api/http';

export type OnboardingProfilePayload = {
  firstName: string;
  lastName: string;
  email: string;
};

export type OnboardingDataSnapshot = {
  profile: OnboardingProfilePayload | null;
};

export type OnboardingStatusResponse = {
  isComplete: boolean;
  requiredSteps: string[];
  completedSteps: string[];
  data: OnboardingDataSnapshot;
};

export async function fetchOnboardingStatus(appVersion: string): Promise<OnboardingStatusResponse> {
  return asData(
    http.get<OnboardingStatusResponse>('/api/onboarding/status', {
      params: { appVersion },
    }),
  );
}

export async function submitOnboardingProfile(payload: OnboardingProfilePayload): Promise<OnboardingDataSnapshot> {
  return asData(http.post<OnboardingDataSnapshot>('/api/onboarding/profile', payload));
}
