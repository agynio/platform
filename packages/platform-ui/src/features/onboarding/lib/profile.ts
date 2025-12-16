import type { OnboardingProfilePayload } from '../api';

export type ProfileFormValues = {
  firstName: string;
  lastName: string;
  email: string;
};

export const EMPTY_PROFILE: ProfileFormValues = {
  firstName: '',
  lastName: '',
  email: '',
};

export function buildProfilePayload(values: ProfileFormValues): OnboardingProfilePayload {
  return {
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    email: values.email.trim(),
  };
}
