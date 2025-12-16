import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { OnboardingContent } from '@/features/onboarding/components/OnboardingContent';
import { buildProfilePayload } from '@/features/onboarding/lib/profile';
import { useOnboardingStatus, useSaveOnboardingProfile } from '@/features/onboarding/hooks';

export function OnboardingPage() {
  const statusQuery = useOnboardingStatus();
  const saveProfile = useSaveOnboardingProfile();
  const navigate = useNavigate();
  const location = useLocation();
  const targetPath = useMemo(() => {
    const state = location.state as { from?: string } | null;
    return state?.from ?? '/agents/graph';
  }, [location.state]);

  if (statusQuery.isLoading) {
    return <FullScreenState variant="loading" onRetry={() => statusQuery.refetch()} />;
  }

  if (statusQuery.isError || !statusQuery.data) {
    return <FullScreenState variant="error" onRetry={() => statusQuery.refetch()} />;
  }

  if (statusQuery.data.isComplete) {
    return (
      <FullScreenState
        variant="success"
        onContinue={() => navigate(targetPath, { replace: true })}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[var(--agyn-bg-light)] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-4xl rounded-[18px] border border-[var(--agyn-border-subtle)] bg-white p-8 shadow-[0px_32px_72px_-24px_rgba(15,23,42,0.35)]">
        <div className="mb-8 space-y-2 text-center">
          <h1 className="text-2xl font-semibold">Complete onboarding</h1>
          <p className="text-sm text-muted-foreground">
            Finish the required steps below to unlock the rest of the workspace.
          </p>
        </div>
        <OnboardingContent
          status={statusQuery.data}
          onSubmitProfile={async (values) => {
            await saveProfile.mutateAsync(buildProfilePayload(values));
          }}
          isSubmitting={saveProfile.isPending}
        />
      </div>
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
      {variant === 'loading' && <Loader2 className="h-12 w-12 animate-spin text-[var(--agyn-blue)]" />}
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
