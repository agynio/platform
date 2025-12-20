import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/Button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';

import { useOnboardingStatus, useSaveOnboardingProfile } from '../hooks';
import type { OnboardingStatusResponse } from '../api';
import {
  ONBOARDING_STEPS_BY_ID,
  PROFILE_STEP_ID,
  type OnboardingStepSubmitHelpers,
} from '../steps.registry';

type OnboardingFlowProps = {
  targetPath: string;
};

export function OnboardingFlow({ targetPath }: OnboardingFlowProps) {
  const navigate = useNavigate();
  const statusQuery = useOnboardingStatus();
  const saveProfile = useSaveOnboardingProfile();

  const status = statusQuery.data ?? null;

  const orderedStepIds = useMemo(() => (status ? deriveOrderedSteps(status) : [PROFILE_STEP_ID]), [status]);
  const firstIncompleteIndex = useMemo(
    () => findFirstIncompleteIndex(status, orderedStepIds),
    [status, orderedStepIds],
  );

  const [activeIndex, setActiveIndex] = useState(firstIncompleteIndex ?? 0);
  const [formState, setFormState] = useState<Record<string, unknown>>({});
  const [validationErrors, setValidationErrors] = useState<Record<string, Record<string, string>>>({});
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (firstIncompleteIndex !== null) {
      setActiveIndex(firstIncompleteIndex);
    } else if (orderedStepIds.length > 0) {
      setActiveIndex(orderedStepIds.length - 1);
    }
  }, [firstIncompleteIndex, orderedStepIds]);

  useEffect(() => {
    if (!status) {
      return;
    }
    setFormState(() => {
      const next: Record<string, unknown> = {};
      for (const stepId of orderedStepIds) {
        const definition = ONBOARDING_STEPS_BY_ID.get(stepId);
        if (!definition) {
          continue;
        }
        next[stepId] = definition.getInitialValues(status);
      }
      return next;
    });
    setValidationErrors({});
    setAttemptedSubmit(false);
  }, [status, orderedStepIds]);

  const activeStepId = orderedStepIds[activeIndex] ?? null;
  const activeDefinition = activeStepId ? ONBOARDING_STEPS_BY_ID.get(activeStepId) ?? null : null;
  const activeValues = activeDefinition && status
    ? (formState[activeStepId] ?? activeDefinition.getInitialValues(status))
    : null;
  const activeErrors = activeStepId ? validationErrors[activeStepId] ?? {} : {};

  const stepHelpers = useMemo<OnboardingStepSubmitHelpers>(
    () => ({
      mutations: {
        saveProfile: (payload) => saveProfile.mutateAsync(payload),
      },
    }),
    [saveProfile],
  );

  const handleRetry = useCallback(() => {
    void statusQuery.refetch();
  }, [statusQuery]);

  const handleChange = useCallback(
    (next: unknown) => {
      if (!activeStepId) {
        return;
      }

      setFormState((prev) => ({
        ...prev,
        [activeStepId]: next,
      }));

      if (attemptedSubmit && activeDefinition) {
        const result = activeDefinition.validate(next);
        setValidationErrors((prev) => ({
          ...prev,
          [activeStepId]: result.errors ?? {},
        }));
      }
    },
    [activeDefinition, activeStepId, attemptedSubmit],
  );

  const handleBack = useCallback(() => {
    setAttemptedSubmit(false);
    setActiveIndex((index) => (index > 0 ? index - 1 : 0));
  }, []);

  const handleContinue = useCallback(async () => {
    if (!status || !activeStepId || !activeDefinition) {
      return;
    }

    const currentValues = formState[activeStepId] ?? activeDefinition.getInitialValues(status);
    const validation = activeDefinition.validate(currentValues);
    setValidationErrors((prev) => ({
      ...prev,
      [activeStepId]: validation.errors ?? {},
    }));
    setAttemptedSubmit(true);

    if (!validation.isValid) {
      return;
    }

    setIsSubmitting(true);
    try {
      await activeDefinition.submit(currentValues, stepHelpers);
      await statusQuery.refetch();
    } catch {
      // Errors are surfaced via the step mutation notifications.
    } finally {
      setIsSubmitting(false);
    }
  }, [activeDefinition, activeStepId, formState, status, statusQuery, stepHelpers]);

  const isBusy = isSubmitting || saveProfile.isPending;

  if (statusQuery.isLoading) {
    return <FullScreenState variant="loading" onRetry={handleRetry} />;
  }

  if (statusQuery.isError || !status) {
    return <FullScreenState variant="error" onRetry={handleRetry} />;
  }

  if (status.isComplete) {
    return <FullScreenState variant="success" onContinue={() => navigate(targetPath, { replace: true })} />;
  }

  const totalSteps = orderedStepIds.length;
  const completedSteps = Math.min(status.completedSteps.length, totalSteps);
  const displayStepNumber = Math.min(activeIndex + 1, totalSteps);
  const progressPercent = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;
  const actionLabel = activeDefinition?.actionLabel ?? 'Continue';
  const continueDisabled = !activeDefinition || isBusy;
  const StepComponent = activeDefinition?.component ?? null;

  return (
    <div className="min-h-screen bg-[var(--agyn-bg-light)] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Complete onboarding</h1>
          <p className="text-sm text-muted-foreground">
            Finish the required steps to unlock the rest of your workspace.
          </p>
        </div>

        <Card className="border-[var(--agyn-border-subtle)] shadow-[0px_32px_72px_-24px_rgba(15,23,42,0.35)]">
          <CardContent className="py-8">
            <StepperHeader
              currentStep={displayStepNumber}
              totalSteps={totalSteps}
              progressPercent={progressPercent}
              isFetching={statusQuery.isFetching}
            />

            <div className="mt-8">
              {StepComponent && activeValues ? (
                <StepComponent
                  value={activeValues}
                  onChange={handleChange}
                  errors={activeErrors}
                  showErrors={attemptedSubmit}
                  isSubmitting={isBusy}
                />
              ) : (
                <UnknownStep stepId={activeStepId} />
              )}
            </div>
          </CardContent>

          <CardFooter className="bg-[var(--agyn-bg-light)] justify-between border-t border-[var(--agyn-border-subtle)]">
            <Button
              type="button"
              variant="outline"
              onClick={handleBack}
              disabled={isBusy || activeIndex === 0}
            >
              Back
            </Button>
            <Button type="button" onClick={handleContinue} disabled={continueDisabled}>
              {isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {actionLabel}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

type StepperHeaderProps = {
  currentStep: number;
  totalSteps: number;
  progressPercent: number;
  isFetching: boolean;
};

function StepperHeader({ currentStep, totalSteps, progressPercent, isFetching }: StepperHeaderProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Step {currentStep} of {totalSteps}
        </span>
        <div className="flex items-center gap-2">
          <span>{Math.round(progressPercent)}% complete</span>
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin text-[var(--agyn-blue)]" /> : null}
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--agyn-border-light)]">
        <div
          className="h-full bg-[var(--agyn-blue)] transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
}

function UnknownStep({ stepId }: { stepId: string | null }) {
  return (
    <div className="rounded-lg border border-dashed border-[var(--agyn-border-light)] bg-background p-6 text-center">
      <p className="font-medium">{stepId ?? 'No active step'}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        This onboarding step is not available in the current application version. Please contact an administrator for
        assistance.
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
  onRetry?: () => void;
  onContinue?: () => void;
}) {
  const copy: Record<FullScreenVariant, { title: string; body: string; icon: ReactElement }> = {
    loading: {
      title: 'Preparing onboarding…',
      body: 'Fetching the latest onboarding requirements.',
      icon: <Loader2 className="h-12 w-12 animate-spin text-[var(--agyn-blue)]" />,
    },
    error: {
      title: 'Unable to load onboarding data',
      body: 'Please retry. If the issue continues, verify the server logs.',
      icon: <AlertTriangle className="h-12 w-12 text-destructive" />,
    },
    success: {
      title: 'You are all set!',
      body: 'All onboarding steps are complete. Continue to the workspace.',
      icon: <CheckCircle2 className="h-12 w-12 text-green-500" />,
    },
  };

  const content = copy[variant];

  return (
    <div className="min-h-screen bg-[var(--agyn-bg-light)] flex flex-col items-center justify-center gap-4 text-center px-6">
      {content.icon}
      <div className="space-y-2">
        <p className="text-xl font-semibold">{content.title}</p>
        <p className="text-sm text-muted-foreground max-w-md">{content.body}</p>
      </div>
      {variant === 'error' && onRetry ? (
        <Button type="button" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
      {variant === 'success' && onContinue ? (
        <Button type="button" onClick={onContinue}>
          Enter workspace
        </Button>
      ) : null}
    </div>
  );
}

function deriveOrderedSteps(status: OnboardingStatusResponse): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const id of status.completedSteps) {
    if (!seen.has(id)) {
      seen.add(id);
      ordered.push(id);
    }
  }

  for (const id of status.requiredSteps) {
    if (!seen.has(id)) {
      seen.add(id);
      ordered.push(id);
    }
  }

  if (ordered.length === 0) {
    ordered.push(PROFILE_STEP_ID);
  }

  return ordered;
}

function findFirstIncompleteIndex(status: OnboardingStatusResponse | null, ordered: string[]): number | null {
  if (!status) {
    return null;
  }

  for (let index = 0; index < ordered.length; index += 1) {
    if (!status.completedSteps.includes(ordered[index]!)) {
      return index;
    }
  }

  return ordered.length > 0 ? ordered.length - 1 : null;
}
