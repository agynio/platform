import { AlertTriangle, Loader2 } from 'lucide-react';

import {
  ScreenDialog,
  ScreenDialogContent,
  ScreenDialogDescription,
  ScreenDialogHeader,
  ScreenDialogTitle,
} from '@/components/Dialog';
import { Button } from '@/components/ui/button';

import type { OnboardingStatusResponse } from '../api';
import { useSaveOnboardingProfile } from '../hooks';

import { OnboardingContent } from './OnboardingContent';
import { buildProfilePayload } from '../lib/profile';

type OnboardingModalProps = {
  open: boolean;
  status: OnboardingStatusResponse | null;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => unknown;
};

export function OnboardingModal({ open, status, isLoading, isError, onRetry }: OnboardingModalProps) {
  const saveProfile = useSaveOnboardingProfile();

  if (!open) {
    return null;
  }

  const showLoading = isLoading && !status;
  const showError = isError && !status;

  return (
    <ScreenDialog open={open} modal data-testid="onboarding-modal" onOpenChange={() => {}}>
      <ScreenDialogContent
        hideCloseButton
        className="w-full max-w-4xl space-y-6"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <ScreenDialogHeader className="space-y-1">
          <ScreenDialogTitle>Complete onboarding</ScreenDialogTitle>
          <ScreenDialogDescription>
            Finish the required steps to unlock the rest of your workspace.
          </ScreenDialogDescription>
        </ScreenDialogHeader>

        {showLoading ? (
          <ModalState variant="loading" />
        ) : showError ? (
          <ModalState variant="error" onRetry={onRetry} />
        ) : status ? (
          <OnboardingContent
            status={status}
            onSubmitProfile={async (values) => {
              await saveProfile.mutateAsync(buildProfilePayload(values));
            }}
            isSubmitting={saveProfile.isPending}
          />
        ) : null}
      </ScreenDialogContent>
    </ScreenDialog>
  );
}

type ModalStateProps = {
  variant: 'loading' | 'error';
  onRetry?: () => unknown;
};

function ModalState({ variant, onRetry }: ModalStateProps) {
  const copy: Record<ModalStateProps['variant'], { title: string; body: string }> = {
    loading: {
      title: 'Preparing onboarding…',
      body: 'Fetching the latest onboarding requirements.',
    },
    error: {
      title: 'Unable to load onboarding data',
      body: 'Please retry. If the issue continues, verify the server logs.',
    },
  };

  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      {variant === 'error' ? (
        <AlertTriangle className="h-10 w-10 text-destructive" />
      ) : (
        <Loader2 className="h-10 w-10 animate-spin text-[var(--agyn-blue)]" />
      )}
      <div className="space-y-1">
        <p className="text-lg font-semibold">{copy[variant].title}</p>
        <p className="text-sm text-muted-foreground">{copy[variant].body}</p>
      </div>
      {variant === 'error' && onRetry ? (
        <Button onClick={() => void onRetry()}>Retry</Button>
      ) : null}
    </div>
  );
}
