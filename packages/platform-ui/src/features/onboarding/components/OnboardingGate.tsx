import { AlertTriangle, Loader2 } from 'lucide-react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { Button } from '@/components/Button';

import { useOnboardingStatus } from '../hooks';

export function OnboardingGate() {
  const statusQuery = useOnboardingStatus();
  const status = statusQuery.data ?? null;
  const location = useLocation();
  const attemptedPath = `${location.pathname}${location.search}${location.hash}`;

  if (!status) {
    if (statusQuery.isError) {
      return <GateMessage variant="error" onRetry={() => statusQuery.refetch()} />;
    }
    return <GateMessage variant="loading" />;
  }

  if (!status.isComplete) {
    return (
      <Navigate
        to="/onboarding"
        replace
        state={{ from: attemptedPath }}
      />
    );
  }

  return <Outlet />;
}

type GateMessageProps = {
  variant: 'loading' | 'error';
  onRetry?: () => unknown;
};

function GateMessage({ variant, onRetry }: GateMessageProps) {
  const copy: Record<GateMessageProps['variant'], { title: string; body: string }> = {
    loading: {
      title: 'Loading your workspace…',
      body: 'Hold on a second while we verify onboarding status.',
    },
    error: {
      title: 'Failed to load onboarding status',
      body: 'Please retry. If this persists, check the server logs.',
    },
  };

  const content = copy[variant];

  return (
    <div className="min-h-screen bg-[var(--agyn-bg-light)] flex flex-col items-center justify-center gap-4 px-6 text-center">
      {variant === 'error' ? (
        <AlertTriangle className="h-10 w-10 text-destructive" />
      ) : (
        <Loader2 className="h-10 w-10 text-[var(--agyn-blue)] animate-spin" />
      )}
      <div className="space-y-1">
        <p className="text-lg font-semibold">{content.title}</p>
        <p className="text-muted-foreground text-sm max-w-md">{content.body}</p>
      </div>
      {variant === 'error' ? (
        <Button type="button" variant="outline" onClick={() => onRetry?.()}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}
