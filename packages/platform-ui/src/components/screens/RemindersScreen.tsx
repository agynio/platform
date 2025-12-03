import { Trash2, ExternalLink, Check, X } from 'lucide-react';
import { Badge } from '../Badge';
import * as Tooltip from '@radix-ui/react-tooltip';
import type { ListRemindersOrder, ListRemindersSort } from '@/features/reminders/api';

export type ReminderStatus = 'scheduled' | 'executed' | 'cancelled';

export interface Reminder {
  id: string;
  note: string;
  scheduledAt: string;
  status: ReminderStatus;
  threadId?: string;
  runId?: string;
  executedAt?: string;
}

interface RemindersScreenProps {
  reminders: Reminder[];
  countsByStatus: { scheduled: number; executed: number; cancelled: number };
  totalCount: number;
  page: number;
  pageSize: number;
  pageCount: number;
  filter: 'all' | ReminderStatus;
  sortApplied?: { key: ListRemindersSort; order: ListRemindersOrder };
  onViewThread?: (threadId: string) => void;
  onViewRun?: (runId: string) => void;
  onDeleteReminder?: (reminderId: string) => void;
  onFilterChange?: (filter: 'all' | ReminderStatus) => void;
  onPageChange?: (page: number) => void;
}

const MAX_VISIBLE_PAGES = 7;
const EDGE_OFFSET = 3;

export default function RemindersScreen({
  reminders,
  countsByStatus,
  totalCount,
  page,
  pageSize,
  pageCount,
  filter,
  onViewThread,
  onViewRun,
  onDeleteReminder,
  onFilterChange,
  onPageChange,
  sortApplied: _sortApplied,
}: RemindersScreenProps) {
  const allCount = countsByStatus.scheduled + countsByStatus.executed + countsByStatus.cancelled;
  const safePageCount = Math.max(0, pageCount);
  const safePage = safePageCount === 0 ? 1 : Math.min(Math.max(1, page), safePageCount);
  const safePageSize = Math.max(1, pageSize);
  const hasPagination = safePageCount > 1;
  const startIndex = totalCount === 0 ? 0 : (safePage - 1) * safePageSize;
  const endIndex = totalCount === 0 ? 0 : Math.min(startIndex + reminders.length, totalCount);
  const rangeStart = totalCount === 0 || reminders.length === 0 ? 0 : startIndex + 1;
  const rangeEnd = totalCount === 0 || reminders.length === 0 ? 0 : endIndex;

  const computeWindow = () => {
    if (safePageCount === 0) {
      return { start: 1, end: 0 };
    }
    if (safePageCount <= MAX_VISIBLE_PAGES) {
      return { start: 1, end: safePageCount };
    }
    if (safePage <= EDGE_OFFSET + 1) {
      return { start: 1, end: MAX_VISIBLE_PAGES };
    }
    if (safePage >= safePageCount - EDGE_OFFSET) {
      const start = Math.max(safePageCount - MAX_VISIBLE_PAGES + 1, 1);
      return { start, end: safePageCount };
    }
    return { start: safePage - EDGE_OFFSET, end: safePage + EDGE_OFFSET };
  };

  const { start: windowStart, end: windowEnd } = computeWindow();
  const pageNumbers = windowEnd < windowStart
    ? []
    : Array.from({ length: windowEnd - windowStart + 1 }, (_, index) => windowStart + index);

  const handleFilterClick = (next: 'all' | ReminderStatus) => {
    if (filter === next) return;
    onFilterChange?.(next);
    onPageChange?.(1);
  };

  const handlePageSelect = (targetPage: number) => {
    if (targetPage === safePage || targetPage < 1 || targetPage > safePageCount) return;
    onPageChange?.(targetPage);
  };

  const handlePrevious = () => {
    if (safePage === 1 || safePageCount === 0) return;
    onPageChange?.(safePage - 1);
  };

  const handleNext = () => {
    if (safePageCount === 0 || safePage === safePageCount) return;
    onPageChange?.(safePage + 1);
  };

  const getTimeDisplay = (reminder: Reminder) => {
    const scheduledTime = new Date(reminder.scheduledAt).getTime();
    const now = Date.now();
    const diff = scheduledTime - now;

    if (diff > 0) {
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      if (days > 0) return `${days}d ${hours}h`;
      if (hours > 0) return `${hours}h ${minutes}m`;
      return `${minutes}m`;
    }

    return null;
  };

  const formatScheduledTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === now.toDateString()) {
      return `Today, ${date.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
    }

    if (date.toDateString() === tomorrow.toDateString()) {
      return `Tomorrow, ${date.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
    }

    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (status: ReminderStatus) => {
    switch (status) {
      case 'scheduled':
        return (
          <Badge variant="warning" size="sm">
            Scheduled
          </Badge>
        );
      case 'executed':
        return (
          <Badge variant="success" size="sm">
            <Check className="w-3 h-3 mr-1" />
            Executed
          </Badge>
        );
      case 'cancelled':
        return (
          <Badge variant="neutral" size="sm">
            <X className="w-3 h-3 mr-1" />
            Cancelled
          </Badge>
        );
    }
  };

  const scheduledCount = countsByStatus.scheduled;
  const executedCount = countsByStatus.executed;
  const cancelledCount = countsByStatus.cancelled;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <div className="border-b border-[var(--agyn-border-subtle)] px-6 py-4">
        <h1 className="text-xl font-semibold text-[var(--agyn-dark)]">Reminders</h1>
        <p className="text-sm text-[var(--agyn-text-subtle)] mt-1">
          Manage your scheduled and executed reminders
        </p>
      </div>

      <div className="border-b border-[var(--agyn-border-subtle)] px-6 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleFilterClick('all')}
            className={`px-3 py-1.5 text-xs rounded-md transition-all ${
              filter === 'all'
                ? 'bg-[var(--agyn-blue)]/10 text-[var(--agyn-blue)]'
                : 'text-[var(--agyn-text-subtle)] hover:bg-[var(--agyn-bg-light)]'
            }`}
          >
            All ({allCount})
          </button>
          <button
            onClick={() => handleFilterClick('scheduled')}
            className={`px-3 py-1.5 text-xs rounded-md transition-all ${
              filter === 'scheduled'
                ? 'bg-[var(--agyn-status-pending)]/10 text-[var(--agyn-status-pending)]'
                : 'text-[var(--agyn-text-subtle)] hover:bg-[var(--agyn-bg-light)]'
            }`}
          >
            Scheduled ({scheduledCount})
          </button>
          <button
            onClick={() => handleFilterClick('executed')}
            className={`px-3 py-1.5 text-xs rounded-md transition-all ${
              filter === 'executed'
                ? 'bg-[var(--agyn-status-finished)]/10 text-[var(--agyn-status-finished)]'
                : 'text-[var(--agyn-text-subtle)] hover:bg-[var(--agyn-bg-light)]'
            }`}
          >
            Executed ({executedCount})
          </button>
          <button
            onClick={() => handleFilterClick('cancelled')}
            className={`px-3 py-1.5 text-xs rounded-md transition-all ${
              filter === 'cancelled'
                ? 'bg-[var(--agyn-text-subtle)]/10 text-[var(--agyn-text-subtle)]'
                : 'text-[var(--agyn-text-subtle)] hover:bg-[var(--agyn-bg-light)]'
            }`}
          >
            Cancelled ({cancelledCount})
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-white shadow-[0_1px_0_0_var(--agyn-border-subtle)]">
              <th className="text-left text-xs font-medium text-[var(--agyn-text-subtle)] py-3 px-6 bg-white">
                Note
              </th>
              <th className="text-left text-xs font-medium text-[var(--agyn-text-subtle)] py-3 px-6 w-48 bg-white">
                Status
              </th>
              <th className="text-left text-xs font-medium text-[var(--agyn-text-subtle)] py-3 px-6 w-28 bg-white">
                Countdown
              </th>
              <th className="text-left text-xs font-medium text-[var(--agyn-text-subtle)] py-3 px-6 w-48 bg-white">
                Scheduled At
              </th>
              <th className="text-right text-xs font-medium text-[var(--agyn-text-subtle)] py-3 px-6 w-32 bg-white">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {reminders.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-12 text-[var(--agyn-text-subtle)]">
                  No reminders found
                </td>
              </tr>
            ) : (
              reminders.map((reminder) => {
                const countdown = getTimeDisplay(reminder);

                return (
                  <tr
                    key={reminder.id}
                    className="border-b border-[var(--agyn-border-subtle)] hover:bg-[var(--agyn-bg-light)] transition-colors"
                  >
                    <td className="py-3 px-6">
                      <div className="text-sm text-[var(--agyn-dark)]">{reminder.note}</div>
                    </td>
                    <td className="py-3 px-6">
                      <div className="flex items-center gap-2">
                        {getStatusBadge(reminder.status)}
                        {reminder.status === 'executed' && reminder.runId && (
                          <Tooltip.Provider delayDuration={300}>
                            <Tooltip.Root>
                              <Tooltip.Trigger asChild>
                                <button
                                  onClick={() => onViewRun?.(reminder.runId!)}
                                  className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--agyn-text-subtle)] hover:bg-[var(--agyn-bg-light)] hover:text-[var(--agyn-blue)] transition-colors"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </button>
                              </Tooltip.Trigger>
                              <Tooltip.Portal>
                                <Tooltip.Content
                                  className="bg-[var(--agyn-dark)] text-white text-xs px-2 py-1 rounded-md"
                                  sideOffset={5}
                                >
                                  View Run Log
                                  <Tooltip.Arrow className="fill-[var(--agyn-dark)]" />
                                </Tooltip.Content>
                              </Tooltip.Portal>
                            </Tooltip.Root>
                          </Tooltip.Provider>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-6">
                      {countdown ? (
                        <div className="text-sm text-[var(--agyn-status-pending)] font-medium">{countdown}</div>
                      ) : (
                        <div className="text-sm text-[var(--agyn-text-subtle)]">—</div>
                      )}
                    </td>
                    <td className="py-3 px-6">
                      <div className="text-xs text-[var(--agyn-text-subtle)]">
                        {formatScheduledTime(reminder.scheduledAt)}
                      </div>
                    </td>
                    <td className="py-3 px-6 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {reminder.threadId && (
                          <Tooltip.Provider delayDuration={300}>
                            <Tooltip.Root>
                              <Tooltip.Trigger asChild>
                                <button
                                  onClick={() => onViewThread?.(reminder.threadId!)}
                                  className="w-8 h-8 flex items-center justify-center rounded-md text-[var(--agyn-text-subtle)] hover:bg-[var(--agyn-bg-light)] hover:text-[var(--agyn-blue)] transition-colors"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </button>
                              </Tooltip.Trigger>
                              <Tooltip.Portal>
                                <Tooltip.Content
                                  className="bg-[var(--agyn-dark)] text-white text-xs px-2 py-1 rounded-md"
                                  sideOffset={5}
                                >
                                  View Thread
                                  <Tooltip.Arrow className="fill-[var(--agyn-dark)]" />
                                </Tooltip.Content>
                              </Tooltip.Portal>
                            </Tooltip.Root>
                          </Tooltip.Provider>
                        )}
                        <Tooltip.Provider delayDuration={300}>
                          <Tooltip.Root>
                            <Tooltip.Trigger asChild>
                              <button
                                onClick={() => onDeleteReminder?.(reminder.id)}
                                className="w-8 h-8 flex items-center justify-center rounded-md text-[var(--agyn-text-subtle)] hover:bg-[var(--agyn-status-failed)]/10 hover:text-[var(--agyn-status-failed)] transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </Tooltip.Trigger>
                            <Tooltip.Portal>
                              <Tooltip.Content
                                className="bg-[var(--agyn-dark)] text-white text-xs px-2 py-1 rounded-md"
                                sideOffset={5}
                              >
                                Delete
                                <Tooltip.Arrow className="fill-[var(--agyn-dark)]" />
                              </Tooltip.Content>
                            </Tooltip.Portal>
                          </Tooltip.Root>
                        </Tooltip.Provider>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {hasPagination && (
        <div className="border-t border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)] px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-[var(--agyn-text-subtle)]">
              Showing {rangeStart} to {rangeEnd} of {totalCount} reminders
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrevious}
                disabled={safePage === 1}
                className="px-3 py-1.5 text-sm text-[var(--agyn-text-subtle)] hover:text-[var(--agyn-dark)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              <div className="flex items-center gap-1">
                {pageNumbers.map((pageNumber) => (
                  <button
                    key={pageNumber}
                    onClick={() => handlePageSelect(pageNumber)}
                    className={`w-8 h-8 rounded-md text-sm transition-all ${
                      safePage === pageNumber
                        ? 'bg-[var(--agyn-blue)]/10 text-[var(--agyn-blue)] font-medium'
                        : 'text-[var(--agyn-text-subtle)] hover:bg-[var(--agyn-bg-light)]'
                    }`}
                    aria-current={safePage === pageNumber ? 'page' : undefined}
                  >
                    {pageNumber}
                  </button>
                ))}
              </div>
              <button
                onClick={handleNext}
                disabled={safePage === safePageCount}
                className="px-3 py-1.5 text-sm text-[var(--agyn-text-subtle)] hover:text-[var(--agyn-dark)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
