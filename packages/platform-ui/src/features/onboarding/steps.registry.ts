import type { ComponentType } from 'react';

import type {
  OnboardingDataSnapshot,
  OnboardingProfilePayload,
  OnboardingStatusResponse,
} from './api';
import { buildProfilePayload, EMPTY_PROFILE, type ProfileFormValues } from './lib/profile';
import { ProfileStep } from './steps/profile-step';

type StringKeys<T> = Extract<keyof T, string>;

export type OnboardingStepValidationResult<TValues> = {
  isValid: boolean;
  errors?: Partial<Record<StringKeys<TValues>, string>>;
};

export type OnboardingStepComponentProps<TValues> = {
  value: TValues;
  onChange: (next: TValues) => void;
  errors: Partial<Record<StringKeys<TValues>, string>>;
  showErrors: boolean;
  isSubmitting: boolean;
};

export type OnboardingStepSubmitHelpers = {
  mutations: {
    saveProfile: (payload: OnboardingProfilePayload) => Promise<OnboardingDataSnapshot>;
  };
};

export type OnboardingStepDefinition<TValues> = {
  id: string;
  title: string;
  description: string;
  actionLabel: string;
  component: ComponentType<OnboardingStepComponentProps<TValues>>;
  getInitialValues: (status: OnboardingStatusResponse) => TValues;
  validate: (values: TValues) => OnboardingStepValidationResult<TValues>;
  submit: (values: TValues, helpers: OnboardingStepSubmitHelpers) => Promise<void>;
};

export type AnyOnboardingStepDefinition = OnboardingStepDefinition<unknown>;

export const PROFILE_STEP_ID = 'profile.basic_v1';

const profileStepDefinition: OnboardingStepDefinition<ProfileFormValues> = {
  id: PROFILE_STEP_ID,
  title: 'Tell us about yourself',
  description: 'Add your first name, last name, and a contact email so agents know who you are.',
  actionLabel: 'Save and continue',
  component: ProfileStep,
  getInitialValues: (status) => ({ ...(status.data.profile ?? EMPTY_PROFILE) }),
  validate: (values) => {
    const errors: Partial<Record<StringKeys<ProfileFormValues>, string>> = {};
    if (!values.firstName.trim()) {
      errors.firstName = 'First name is required';
    }
    if (!values.lastName.trim()) {
      errors.lastName = 'Last name is required';
    }
    if (!/.+@.+\..+/.test(values.email.trim())) {
      errors.email = 'Enter a valid email';
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
    };
  },
  submit: async (values, helpers) => {
    await helpers.mutations.saveProfile(buildProfilePayload(values));
  },
};

export const ONBOARDING_STEPS: AnyOnboardingStepDefinition[] = [
  profileStepDefinition as AnyOnboardingStepDefinition,
];

export const ONBOARDING_STEPS_BY_ID = new Map<string, AnyOnboardingStepDefinition>(
  ONBOARDING_STEPS.map((step) => [step.id, step]),
);
