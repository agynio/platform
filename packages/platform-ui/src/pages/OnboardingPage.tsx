import { useCallback, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { cn } from '@/components/ui/utils';
import { useOnboardingStatus, useSaveOnboardingProfile } from '@/features/onboarding/hooks';
import type { OnboardingStatusResponse } from '@/features/onboarding/api';

const PROFILE_STEP_ID = 'profile.basic_v1';
const STEP_COPY: Record<string, { title: string; description: string }> = {
  [PROFILE_STEP_ID]: {
    title: 'Tell us about yourself',
    description: 'Add your first name, last name, and a contact email so agents know who you are.',
  },
};

type ProfileFormValues = {
  firstName: string;
  lastName: string;
  email: string;
};

const EMPTY_PROFILE: ProfileFormValues = { firstName: '', lastName: '', email: '' };

export function OnboardingPage() {
  const statusQuery = useOnboardingStatus();
  const saveProfile = useSaveOnboardingProfile();
  const navigate = useNavigate();
  const location = useLocation();
  const targetPath = useMemo(() => {
    const state = location.state as { from?: string } | null;
    return state?.from ?? '/agents/graph';
  }, [location.state]);

  const status = statusQuery.data ?? null;
  const orderedSteps = useMemo(() => (status ? deriveOrderedSteps(status) : [PROFILE_STEP_ID]), [status]);
  const currentStepId = status?.requiredSteps[0] ?? null;

  const handleProfileSubmit = useCallback(
    async (values: ProfileFormValues) => {
      const payload = {
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        email: values.email.trim(),
      };
      await saveProfile.mutateAsync(payload);
    },
    [saveProfile],
  );

  if (statusQuery.isLoading) {
    return <FullScreenState variant="loading" onRetry={() => statusQuery.refetch()} />;
  }

  if (statusQuery.isError || !status) {
    return <FullScreenState variant="error" onRetry={() => statusQuery.refetch()} />;
  }

  if (status.isComplete) {
    return (
      <FullScreenState
        variant="success"
        onContinue={() => navigate(targetPath, { replace: true })}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[var(--agyn-bg-light)] flex items-center justify-center px-4 py-10">
      <Card className="w-full max-w-3xl border border-[var(--agyn-border-light)] shadow-xl">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold">Complete onboarding</CardTitle>
          <CardDescription>
            Finish the required steps below to unlock the rest of the workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <WizardProgress status={status} orderedSteps={orderedSteps} />
          <div className="grid gap-8 lg:grid-cols-2">
            <StepList orderedSteps={orderedSteps} status={status} currentStepId={currentStepId} />
            <div className="rounded-xl border border-[var(--agyn-border-light)] p-6 bg-white shadow-sm">
              {currentStepId === PROFILE_STEP_ID ? (
                <ProfileStepForm
                  initialValues={status.data.profile ?? EMPTY_PROFILE}
                  onSubmit={handleProfileSubmit}
                  isSubmitting={saveProfile.isPending}
                />
              ) : (
                <UnknownStep stepId={currentStepId} />
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function deriveOrderedSteps(status: OnboardingStatusResponse): string[] {
  const ordered: string[] = [];
  for (const id of status.completedSteps) {
    if (!ordered.includes(id)) ordered.push(id);
  }
  for (const id of status.requiredSteps) {
    if (!ordered.includes(id)) ordered.push(id);
  }
  return ordered.length > 0 ? ordered : [PROFILE_STEP_ID];
}

function WizardProgress({
  status,
  orderedSteps,
}: {
  status: OnboardingStatusResponse;
  orderedSteps: string[];
}) {
  const totalSteps = Math.max(orderedSteps.length, 1);
  const completed = Math.min(status.completedSteps.length, totalSteps);
  const currentNumber = Math.min(completed + 1, totalSteps);
  const progressPercent = (completed / totalSteps) * 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Step {currentNumber} of {totalSteps}
        </span>
        <span>{Math.round(progressPercent)}% complete</span>
      </div>
      <div className="h-2 rounded-full bg-[var(--agyn-border-light)] overflow-hidden">
        <div
          className="h-full bg-[var(--agyn-blue)] transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
}

function StepList({
  orderedSteps,
  status,
  currentStepId,
}: {
  orderedSteps: string[];
  status: OnboardingStatusResponse;
  currentStepId: string | null;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Required steps</p>
      <ul className="space-y-3">
        {orderedSteps.map((stepId) => {
          const copy = STEP_COPY[stepId] ?? {
            title: stepId,
            description: 'Complete this step to continue.',
          };
          const isComplete = status.completedSteps.includes(stepId);
          const isActive = stepId === currentStepId;
          return (
            <li key={stepId} className="flex items-start gap-3">
              {isComplete ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <span
                  className={cn(
                    'h-5 w-5 rounded-full border border-[var(--agyn-border-light)] mt-0.5',
                    isActive && 'border-[var(--agyn-blue)] bg-[rgba(67,97,238,0.08)]',
                  )}
                />
              )}
              <div>
                <p className="font-medium text-sm">{copy.title}</p>
                <p className="text-xs text-muted-foreground leading-snug">{copy.description}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ProfileStepForm({
  initialValues,
  onSubmit,
  isSubmitting,
}: {
  initialValues: ProfileFormValues;
  onSubmit: (values: ProfileFormValues) => Promise<void>;
  isSubmitting: boolean;
}) {
  const form = useForm<ProfileFormValues>({
    defaultValues: initialValues ?? EMPTY_PROFILE,
  });

  useEffect(() => {
    form.reset(initialValues ?? EMPTY_PROFILE);
  }, [initialValues, form]);

  return (
    <Form {...form}>
      <form
        className="space-y-4"
        onSubmit={form.handleSubmit(async (values) => {
          await onSubmit(values);
        })}
      >
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Profile basics</h3>
          <p className="text-sm text-muted-foreground">
            We use this information to personalize agent assignments and notifications.
          </p>
        </div>

        <FormField
          control={form.control}
          name="firstName"
          rules={{
            required: 'First name is required',
            validate: (value) => value.trim().length > 0 || 'First name is required',
          }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>First name</FormLabel>
              <FormControl>
                <Input {...field} autoComplete="given-name" placeholder="Jane" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="lastName"
          rules={{
            required: 'Last name is required',
            validate: (value) => value.trim().length > 0 || 'Last name is required',
          }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Last name</FormLabel>
              <FormControl>
                <Input {...field} autoComplete="family-name" placeholder="Doe" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="email"
          rules={{
            required: 'Email is required',
            validate: (value) => /.+@.+\..+/.test(value.trim()) || 'Enter a valid email',
          }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input {...field} type="email" autoComplete="email" placeholder="you@example.com" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save and continue
        </Button>
      </form>
    </Form>
  );
}

function UnknownStep({ stepId }: { stepId: string | null }) {
  if (!stepId) {
    return (
      <div className="text-sm text-muted-foreground">
        No additional steps are required right now.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="font-medium">{stepId}</p>
      <p className="text-sm text-muted-foreground">
        This onboarding step is not yet supported in the UI. Please check back after updating the application.
      </p>
    </div>
  );
}

type FullScreenVariant = 'loading' | 'error' | 'success';

function FullScreenState({
  variant,
  onRetry,
  onContinue,
}: {
  variant: FullScreenVariant;
  onRetry?: () => Promise<unknown> | unknown;
  onContinue?: () => void;
}) {
  const copy: Record<FullScreenVariant, { title: string; body: string }> = {
    loading: {
      title: 'Preparing onboarding…',
      body: 'Fetching the latest onboarding requirements.',
    },
    error: {
      title: 'Unable to load onboarding data',
      body: 'Please retry. If the issue continues, verify the server logs.',
    },
    success: {
      title: 'You are all set!',
      body: 'All onboarding steps are complete. Continue to the workspace.',
    },
  };

  return (
    <div className="min-h-screen bg-[var(--agyn-bg-light)] flex flex-col items-center justify-center gap-4 text-center px-6">
      {variant === 'error' && <AlertTriangle className="h-12 w-12 text-destructive" />}
      {variant === 'loading' && <Loader2 className="h-12 w-12 text-[var(--agyn-blue)] animate-spin" />}
      {variant === 'success' && <CheckCircle2 className="h-12 w-12 text-green-500" />}
      <div className="space-y-2">
        <p className="text-xl font-semibold">{copy[variant].title}</p>
        <p className="text-sm text-muted-foreground max-w-md">{copy[variant].body}</p>
      </div>
      {variant === 'error' && onRetry && (
        <Button onClick={() => void onRetry()}>Retry</Button>
      )}
      {variant === 'success' && onContinue && (
        <Button onClick={onContinue}>Enter workspace</Button>
      )}
    </div>
  );
}
