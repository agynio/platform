import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifyError, notifySuccess } from '@/lib/notify';
import {
  fetchOnboardingStatus,
  submitOnboardingProfile,
  type OnboardingProfilePayload,
  type OnboardingStatusResponse,
} from './api';

const ONBOARDING_QUERY_KEY = ['onboarding-status'];

export function useOnboardingStatus(options?: { enabled?: boolean }) {
  return useQuery<OnboardingStatusResponse, Error>({
    queryKey: ONBOARDING_QUERY_KEY,
    queryFn: () => fetchOnboardingStatus(),
    staleTime: 60_000,
    enabled: options?.enabled ?? true,
  });
}

export function useSaveOnboardingProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: OnboardingProfilePayload) => submitOnboardingProfile(payload),
    onSuccess: async () => {
      notifySuccess('Profile saved');
      await qc.invalidateQueries({ queryKey: ONBOARDING_QUERY_KEY });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Save failed';
      notifyError(message);
    },
  });
}
