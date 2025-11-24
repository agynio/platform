import RemindersScreen from '../screens/RemindersScreen';
import type { ReminderVm } from '@/features/reminders/types';

interface RemindersLayoutProps {
  reminders?: ReminderVm[];
  isLoading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  onViewThread?: (threadId: string) => void;
  onViewRun?: (runId: string) => void;
}

export function RemindersLayout({
  reminders = [],
  isLoading = false,
  error = null,
  onRetry,
  onViewThread,
  onViewRun,
}: RemindersLayoutProps) {
  const showLoading = isLoading && !error;
  const errorMessage = error?.message?.trim() || 'Failed to load reminders';

  return (
    <div className="relative flex min-h-0 flex-1 overflow-hidden bg-white">
      <RemindersScreen
        reminders={reminders}
        onViewThread={onViewThread}
        onViewRun={onViewRun}
        onDeleteReminder={undefined}
      />

      {showLoading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-sm" role="status">
          <span className="text-sm text-[var(--agyn-text-subtle)]">Loading reminders…</span>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/85 backdrop-blur-sm" role="alert">
          <span className="text-sm font-medium text-[var(--agyn-status-failed)]">{errorMessage}</span>
          {onRetry && (
            <button
              type="button"
              className="rounded-md border border-[var(--agyn-border-subtle)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--agyn-blue)] shadow-sm transition-colors hover:border-[var(--agyn-blue)]/40 hover:text-[var(--agyn-blue)]"
              onClick={onRetry}
            >
              Try again
            </button>
          )}
        </div>
      )}
    </div>
  );
}
