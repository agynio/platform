import { AlertTriangle, Loader2 } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useOnboardingStatus } from '../hooks';

export function OnboardingGate() {
  const statusQuery = useOnboardingStatus();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = useMemo(
    () => `${location.pathname}${location.search}${location.hash}`,
    [location.pathname, location.search, location.hash],
  );

  useEffect(() => {
    if (!statusQuery.data) return;
    if (statusQuery.data.isComplete) return;
    navigate('/onboarding', { replace: true, state: { from: returnTo } });
  }, [statusQuery.data, navigate, returnTo]);

  if (statusQuery.isLoading) {
    return <GateMessage variant="loading" />;
  }

  if (statusQuery.isError) {
    return <GateMessage variant="error" onRetry={() => statusQuery.refetch()} />;
  }

  if (!statusQuery.data) {
    return null;
  }

  if (!statusQuery.data.isComplete) {
    return <GateMessage variant="redirecting" />;
  }

  return <Outlet />;
}

type GateMessageProps = {
  variant: 'loading' | 'error' | 'redirecting';
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
    redirecting: {
      title: 'Finish onboarding to continue',
      body: 'We are redirecting you to the onboarding wizard.',
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
      {variant === 'error' && (
        <Button onClick={() => void onRetry?.()} variant="default">
          Retry
        </Button>
      )}
    </div>
  );
}
