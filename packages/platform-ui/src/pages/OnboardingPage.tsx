import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';

import { OnboardingFlow } from '@/features/onboarding/components/OnboardingFlow';

export function OnboardingPage() {
  const location = useLocation();
  const targetPath = useMemo(() => {
    const state = location.state as { from?: string } | null;
    return state?.from ?? '/agents/graph';
  }, [location.state]);

  return <OnboardingFlow targetPath={targetPath} />;
}
