import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="onboarding-profile-first-name" className="text-sm font-medium">
            First name
          </Label>
          <Input
            id="onboarding-profile-first-name"
            value={value.firstName}
            onChange={(event) => handleFieldChange('firstName', event.currentTarget.value)}
            autoComplete="given-name"
            placeholder="Jane"
            aria-invalid={firstNameError ? 'true' : undefined}
            aria-describedby={firstNameError ? 'onboarding-profile-first-name-error' : undefined}
            disabled={isSubmitting}
          />
          {firstNameError ? (
            <p id="onboarding-profile-first-name-error" role="alert" className="text-xs text-destructive">
              {firstNameError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="onboarding-profile-last-name" className="text-sm font-medium">
            Last name
          </Label>
          <Input
            id="onboarding-profile-last-name"
            value={value.lastName}
            onChange={(event) => handleFieldChange('lastName', event.currentTarget.value)}
            autoComplete="family-name"
            placeholder="Doe"
            aria-invalid={lastNameError ? 'true' : undefined}
            aria-describedby={lastNameError ? 'onboarding-profile-last-name-error' : undefined}
            disabled={isSubmitting}
          />
          {lastNameError ? (
            <p id="onboarding-profile-last-name-error" role="alert" className="text-xs text-destructive">
              {lastNameError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="onboarding-profile-email" className="text-sm font-medium">
            Email
          </Label>
          <Input
            id="onboarding-profile-email"
            type="email"
            value={value.email}
            onChange={(event) => handleFieldChange('email', event.currentTarget.value)}
            autoComplete="email"
            placeholder="you@example.com"
            aria-invalid={emailError ? 'true' : undefined}
            aria-describedby={emailError ? 'onboarding-profile-email-error' : undefined}
            disabled={isSubmitting}
          />
          {emailError ? (
            <p id="onboarding-profile-email-error" role="alert" className="text-xs text-destructive">
              {emailError}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
