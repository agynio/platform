import { Input } from '@/components/Input';

import type { OnboardingStepComponentProps } from '../steps.registry';
import type { ProfileFormValues } from '../lib/profile';

export function ProfileStep({ value, onChange, errors, showErrors, isSubmitting }: OnboardingStepComponentProps<ProfileFormValues>) {
  const handleFieldChange = <K extends keyof ProfileFormValues>(field: K, next: ProfileFormValues[K]) => {
    onChange({ ...value, [field]: next });
  };

  const firstNameError = showErrors ? errors.firstName : undefined;
  const lastNameError = showErrors ? errors.lastName : undefined;
  const emailError = showErrors ? errors.email : undefined;

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <h2 className="text-xl font-semibold tracking-tight">Profile basics</h2>
        <p className="text-sm text-muted-foreground">
          We use this information to personalize agent assignments and notifications.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <Input
          id="onboarding-profile-first-name"
          label="First name"
          value={value.firstName}
          onChange={(event) => handleFieldChange('firstName', event.currentTarget.value)}
          autoComplete="given-name"
          placeholder="Jane"
          aria-invalid={firstNameError ? 'true' : undefined}
          error={firstNameError}
          disabled={isSubmitting}
        />

        <Input
          id="onboarding-profile-last-name"
          label="Last name"
          value={value.lastName}
          onChange={(event) => handleFieldChange('lastName', event.currentTarget.value)}
          autoComplete="family-name"
          placeholder="Doe"
          aria-invalid={lastNameError ? 'true' : undefined}
          error={lastNameError}
          disabled={isSubmitting}
        />

        <Input
          id="onboarding-profile-email"
          label="Email"
          type="email"
          value={value.email}
          onChange={(event) => handleFieldChange('email', event.currentTarget.value)}
          autoComplete="email"
          placeholder="you@example.com"
          aria-invalid={emailError ? 'true' : undefined}
          error={emailError}
          disabled={isSubmitting}
        />
      </div>
    </div>
  );
}
