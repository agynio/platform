import React from 'react';
import { Save as SaveIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, cn } from '@hautech/ui';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'conflict';

const LABELS: Record<SaveState, string> = {
  idle: 'All changes saved',
  saved: 'Saved',
  saving: 'Saving…',
  error: 'Save failed',
  conflict: 'Edit conflict',
};

const COLORS: Record<SaveState, string> = {
  idle: 'text-emerald-600',
  saved: 'text-emerald-600',
  saving: 'text-yellow-600',
  error: 'text-red-600',
  conflict: 'text-red-600',
};

export function SaveStatusIndicator({ state }: { state: SaveState }) {
  const label = LABELS[state];
  const color = COLORS[state];
  const pulse = state === 'saving';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn('pointer-events-auto inline-flex items-center rounded p-1', color, pulse && 'animate-pulse')}
            role="status"
            aria-live="polite"
            aria-label={label}
            data-testid="save-status"
            title={label}
          >
            <SaveIcon className="h-4 w-4" aria-hidden="true" />
          </div>
        </TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
