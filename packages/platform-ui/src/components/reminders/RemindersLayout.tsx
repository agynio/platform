import RemindersScreen from '../screens/RemindersScreen';
import type { ReminderVm } from '@/features/reminders/types';
import type { CountsByStatus, ListRemindersOrder, ListRemindersSort } from '@/features/reminders/api';

interface RemindersLayoutProps {
  reminders?: ReminderVm[];
  countsByStatus?: CountsByStatus;
  totalCount?: number;
  page?: number;
  pageSize?: number;
  pageCount?: number;
  filter?: 'all' | 'scheduled' | 'executed' | 'cancelled';
  sortApplied?: { key: ListRemindersSort; order: ListRemindersOrder };
  onFilterChange?: (filter: 'all' | 'scheduled' | 'executed' | 'cancelled') => void;
  onPageChange?: (page: number) => void;
  isLoading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  onViewThread?: (threadId: string) => void;
  onViewRun?: (runId: string) => void;
}

export function RemindersLayout({
  reminders = [],
  countsByStatus,
  totalCount,
  page,
  pageSize,
  pageCount,
  filter = 'all',
  sortApplied,
  onFilterChange,
  onPageChange,
  isLoading = false,
  error = null,
  onRetry,
  onViewThread,
  onViewRun,
}: RemindersLayoutProps) {
  const resolvedCounts = countsByStatus ?? { scheduled: 0, executed: 0, cancelled: 0 };
  const resolvedTotal = totalCount ?? reminders.length;
  const resolvedPageSize = pageSize ?? (reminders.length > 0 ? reminders.length : 20);
  const resolvedPage = page ?? 1;
  const resolvedPageCount = pageCount ?? (resolvedTotal === 0 ? 0 : Math.ceil(resolvedTotal / resolvedPageSize));
  const showLoading = isLoading && !error;
  const errorMessage = error?.message?.trim() || 'Failed to load reminders';

  return (
    <div className="relative flex min-h-0 flex-1 overflow-hidden bg-white">
      <RemindersScreen
        reminders={reminders}
        countsByStatus={resolvedCounts}
        totalCount={resolvedTotal}
        page={resolvedPage}
        pageSize={resolvedPageSize}
        pageCount={resolvedPageCount}
        filter={filter}
        sortApplied={sortApplied}
        onFilterChange={onFilterChange}
        onPageChange={onPageChange}
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
