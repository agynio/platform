import { Check, Loader2, AlertCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

export type SavingStatus = 'saved' | 'saving' | 'error';

interface SavingStatusControlProps {
  status: SavingStatus;
  errorMessage?: string;
}

const statusConfig = {
  saved: {
    icon: Check,
    color: 'var(--agyn-status-finished)',
    bgColor: 'var(--agyn-status-finished-bg)',
    label: 'All changes saved',
  },
  saving: {
    icon: Loader2,
    color: 'var(--agyn-status-pending)',
    bgColor: 'var(--agyn-status-pending-bg)',
    label: 'Saving...',
  },
  error: {
    icon: AlertCircle,
    color: 'var(--agyn-status-failed)',
    bgColor: 'var(--agyn-status-failed-bg)',
    label: 'Failed to save',
  },
};

export function SavingStatusControl({ status, errorMessage }: SavingStatusControlProps) {
  const config = statusConfig[status];
  const Icon = config.icon;
  const isError = status === 'error';
  const isSaving = status === 'saving';

  const content = (
    <div
      className={`
        flex items-center justify-center rounded-[8px] border transition-all
        ${isError ? 'gap-2 px-3 py-2 border-[var(--agyn-status-failed)] shadow-sm' : 'w-8 h-8 border-[var(--agyn-border-subtle)]'}
      `}
      style={{
        backgroundColor: config.bgColor,
      }}
    >
      <Icon
        size={isError ? 16 : 14}
        style={{ color: config.color }}
        className={isSaving ? 'animate-spin' : ''}
      />
      {isError && (
        <span className="text-sm" style={{ color: config.color }}>
          Save failed
        </span>
      )}
    </div>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {content}
      </TooltipTrigger>
      <TooltipContent>
        <div className="text-xs">
          <div>{config.label}</div>
          {isError && errorMessage && (
            <div className="mt-1 opacity-90">{errorMessage}</div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
