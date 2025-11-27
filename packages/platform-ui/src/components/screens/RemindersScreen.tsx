import { Trash2, ExternalLink, Check, X } from 'lucide-react';
import { Badge } from '../Badge';
import * as Tooltip from '@radix-ui/react-tooltip';
import type {
  ListRemindersSortBy,
  ListRemindersSortOrder,
  ReminderStatusCounts,
  ReminderStatusFilter,
} from '@/features/reminders/types';

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
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  sortBy: ListRemindersSortBy;
  sortOrder: ListRemindersSortOrder;
  countsByStatus: ReminderStatusCounts;
  statusFilter: ReminderStatusFilter;
  perPageOptions?: number[];
  onViewThread?: (threadId: string) => void;
  onViewRun?: (runId: string) => void;
  onDeleteReminder?: (reminderId: string) => void;
  onStatusFilterChange?: (filter: ReminderStatusFilter) => void;
  onPageChange?: (page: number) => void;
  onPerPageChange?: (perPage: number) => void;
  onSortByChange?: (sortBy: ListRemindersSortBy) => void;
  onSortOrderChange?: (sortOrder: ListRemindersSortOrder) => void;
}

export default function RemindersScreen({
  reminders = [],
  page,
  perPage,
  total,
  totalPages,
  sortBy,
  sortOrder,
  countsByStatus,
  statusFilter,
  perPageOptions = [20, 50, 100],
  onViewThread,
  onViewRun,
  onDeleteReminder,
  onStatusFilterChange,
  onPageChange,
  onPerPageChange,
  onSortByChange,
  onSortOrderChange,
}: RemindersScreenProps) {
  const safeTotalPages = totalPages > 0 ? totalPages : 0;
  const safePage = Math.min(Math.max(page, 1), Math.max(safeTotalPages, 1));
  const startIndex = total === 0 ? 0 : (safePage - 1) * perPage + 1;
  const endIndex = total === 0 ? 0 : Math.min(safePage * perPage, total);

  // Calculate countdown or time since
  const getTimeDisplay = (reminder: Reminder) => {
    const scheduledTime = new Date(reminder.scheduledAt).getTime();
    const now = Date.now();
    const diff = scheduledTime - now;

    if (diff > 0) {
      // Future date - show countdown
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
    
    // Check if today
    if (date.toDateString() === now.toDateString()) {
      return `Today, ${date.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
    }
    
    // Check if tomorrow
    if (date.toDateString() === tomorrow.toDateString()) {
      return `Tomorrow, ${date.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
    }
    
    // Otherwise show month and day
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
  const allCount = total;

  const handleStatusFilterChange = (next: ReminderStatusFilter) => {
    onStatusFilterChange?.(next);
  };

  const handlePageChange = (next: number) => {
    if (next < 1 || (safeTotalPages > 0 && next > safeTotalPages)) return;
    onPageChange?.(next);
  };

  const handlePerPageChange = (next: number) => {
    if (!Number.isFinite(next) || next <= 0) return;
    onPerPageChange?.(next);
  };

  const handleSortOrderToggle = () => {
    onSortOrderChange?.(sortOrder === 'asc' ? 'desc' : 'asc');
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
          {/* Header */}
          <div className="border-b border-[var(--agyn-border-subtle)] px-6 py-4">
            <h1 className="text-xl font-semibold text-[var(--agyn-dark)]">Reminders</h1>
            <p className="text-sm text-[var(--agyn-text-subtle)] mt-1">
              Manage your scheduled and executed reminders
            </p>
          </div>

          {/* Filters */}
          <div className="border-b border-[var(--agyn-border-subtle)] px-6 py-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-2">
                <button
                onClick={() => handleStatusFilterChange('all')}
                className={`px-3 py-1.5 text-xs rounded-md transition-all ${
                  statusFilter === 'all'
                    ? 'bg-[var(--agyn-blue)]/10 text-[var(--agyn-blue)]'
                    : 'text-[var(--agyn-text-subtle)] hover:bg-[var(--agyn-bg-light)]'
                }`}
              >
                All ({allCount})
              </button>
              <button
                onClick={() => handleStatusFilterChange('scheduled')}
                className={`px-3 py-1.5 text-xs rounded-md transition-all ${
                  statusFilter === 'scheduled'
                    ? 'bg-[var(--agyn-status-pending)]/10 text-[var(--agyn-status-pending)]'
                    : 'text-[var(--agyn-text-subtle)] hover:bg-[var(--agyn-bg-light)]'
                }`}
              >
                Scheduled ({scheduledCount})
              </button>
              <button
                onClick={() => handleStatusFilterChange('executed')}
                className={`px-3 py-1.5 text-xs rounded-md transition-all ${
                  statusFilter === 'executed'
                    ? 'bg-[var(--agyn-status-finished)]/10 text-[var(--agyn-status-finished)]'
                    : 'text-[var(--agyn-text-subtle)] hover:bg-[var(--agyn-bg-light)]'
                }`}
              >
                Executed ({executedCount})
              </button>
              <button
                onClick={() => handleStatusFilterChange('cancelled')}
                className={`px-3 py-1.5 text-xs rounded-md transition-all ${
                  statusFilter === 'cancelled'
                    ? 'bg-[var(--agyn-text-subtle)]/10 text-[var(--agyn-text-subtle)]'
                    : 'text-[var(--agyn-text-subtle)] hover:bg-[var(--agyn-bg-light)]'
                }`}
              >
                Cancelled ({cancelledCount})
              </button>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-[var(--agyn-text-subtle)]">
                  <span>Sort by</span>
                  <select
                    value={sortBy}
                    onChange={(event) => onSortByChange?.(event.target.value as ListRemindersSortBy)}
                    className="rounded-md border border-[var(--agyn-border-subtle)] bg-white px-2 py-1 text-xs text-[var(--agyn-dark)] focus:border-[var(--agyn-blue)] focus:outline-none"
                  >
                    <option value="createdAt">Created</option>
                    <option value="at">Scheduled</option>
                    <option value="completedAt">Completed</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleSortOrderToggle}
                    className="rounded-md border border-[var(--agyn-border-subtle)] px-2 py-1 text-xs font-medium text-[var(--agyn-text-subtle)] transition-colors hover:border-[var(--agyn-blue)]/40 hover:text-[var(--agyn-blue)]"
                  >
                    {sortOrder === 'desc' ? 'Desc' : 'Asc'}
                  </button>
                </label>

                <label className="flex items-center gap-2 text-xs text-[var(--agyn-text-subtle)]">
                  <span>Rows</span>
                  <select
                    value={perPage}
                    onChange={(event) => handlePerPageChange(Number(event.target.value))}
                    className="rounded-md border border-[var(--agyn-border-subtle)] bg-white px-2 py-1 text-xs text-[var(--agyn-dark)] focus:border-[var(--agyn-blue)] focus:outline-none"
                  >
                    {perPageOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </div>

          {/* Table */}
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
                            <div className="text-sm text-[var(--agyn-status-pending)] font-medium">
                              {countdown}
                            </div>
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

          {/* Pagination */}
          {safeTotalPages > 1 && (
            <div className="border-t border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)] px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-[var(--agyn-text-subtle)]">
                  {total === 0 ? 'Showing 0 to 0 of 0 reminders' : `Showing ${startIndex} to ${endIndex} of ${total} reminders`}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePageChange(safePage - 1)}
                    disabled={safePage === 1}
                    className="px-3 py-1.5 text-sm text-[var(--agyn-text-subtle)] hover:text-[var(--agyn-dark)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: safeTotalPages }, (_, i) => i + 1).map((pageNumber) => (
                      <button
                        key={pageNumber}
                        onClick={() => handlePageChange(pageNumber)}
                        className={`w-8 h-8 rounded-md text-sm transition-all ${
                          safePage === pageNumber
                            ? 'bg-[var(--agyn-blue)]/10 text-[var(--agyn-blue)] font-medium'
                            : 'text-[var(--agyn-text-subtle)] hover:bg-[var(--agyn-bg-light)]'
                        }`}
                      >
                        {pageNumber}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => handlePageChange(safePage + 1)}
                    disabled={safePage === safeTotalPages}
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
