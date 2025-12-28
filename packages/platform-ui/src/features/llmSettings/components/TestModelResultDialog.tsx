import { type ReactElement } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

import {
  ScreenDialog,
  ScreenDialogContent,
  ScreenDialogDescription,
  ScreenDialogFooter,
  ScreenDialogHeader,
  ScreenDialogTitle,
} from '@/components/Dialog';
import { Button } from '@/components/Button';
import { cn } from '@/lib/utils';
import type { LiteLLMHealthResponse } from '@/api/modules/llmSettings';

export type TestModelErrorState = {
  message: string;
  payload?: unknown;
};

function formatPayload(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

interface TestModelResultDialogProps {
  open: boolean;
  subjectLabel: string;
  result?: LiteLLMHealthResponse;
  error?: TestModelErrorState;
  onClose: () => void;
  onBack?: () => void;
}

export function TestModelResultDialog({
  open,
  subjectLabel,
  result,
  error,
  onClose,
  onBack,
}: TestModelResultDialogProps): ReactElement {
  const success = Boolean(result);
  const payload = success ? result : error?.payload;
  const payloadText = formatPayload(payload);
  const statusText = success ? 'Test succeeded' : 'Test failed';
  const detailMessage = !success ? error?.message : undefined;

  return (
    <ScreenDialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <ScreenDialogContent className="sm:max-w-xl">
        <ScreenDialogHeader>
          <ScreenDialogTitle>{subjectLabel}</ScreenDialogTitle>
          <ScreenDialogDescription>
            {success ? 'LiteLLM connection succeeded.' : 'LiteLLM reported an error during testing.'}
          </ScreenDialogDescription>
        </ScreenDialogHeader>

        <div className="flex items-start gap-3 rounded-md border border-border bg-muted/40 px-4 py-3 text-sm">
          <span
            className={cn(
              'mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full border border-transparent',
              success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700',
            )}
            aria-hidden
          >
            {success ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          </span>
          <div className="flex-1 space-y-2">
            <p className="font-semibold text-[var(--agyn-dark)]">{statusText}</p>
            {detailMessage ? <p className="text-sm text-[var(--agyn-text-subtle)]">{detailMessage}</p> : null}
            {payloadText ? (
              <pre className="max-h-72 overflow-auto rounded border border-border bg-background px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words">
                {payloadText}
              </pre>
            ) : null}
          </div>
        </div>

        <ScreenDialogFooter className="mt-6">
          {onBack ? (
            <Button variant="ghost" size="md" onClick={onBack}>
              Back to test
            </Button>
          ) : null}
          <Button variant="primary" size="md" onClick={onClose}>
            Close
          </Button>
        </ScreenDialogFooter>
      </ScreenDialogContent>
    </ScreenDialog>
  );
}
