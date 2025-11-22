import { useState } from 'react';
import { ArrowLeft, Clock, Trash2, ExternalLink, Check, X } from 'lucide-react';
import Sidebar from '../Sidebar';
import { Button } from '../Button';
import { IconButton } from '../IconButton';
import { Badge } from '../Badge';
import * as Tooltip from '@radix-ui/react-tooltip';

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
  onViewThread?: (threadId: string) => void;
  onViewRun?: (runId: string) => void;
  onDeleteReminder?: (reminderId: string) => void;
  onBack?: () => void;
  selectedMenuItem?: string;
  onMenuItemSelect?: (itemId: string) => void;
}

const ITEMS_PER_PAGE = 20;

export default function RemindersScreen({
  reminders,
  onViewThread,
  onViewRun,
  onDeleteReminder,
  onBack,
  selectedMenuItem,
  onMenuItemSelect,
}: RemindersScreenProps) {
  const [statusFilter, setStatusFilter] = useState<ReminderStatus | 'all'>('all');
  const [currentPage, setCurrentPage] = useState(1);

  // Filter reminders
  const filteredReminders = reminders.filter(reminder => {
    if (statusFilter === 'all') return true;
    return reminder.status === statusFilter;
  });

  // Pagination
  const totalPages = Math.ceil(filteredReminders.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedReminders = filteredReminders.slice(startIndex, endIndex);

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

  const scheduledCount = reminders.filter(r => r.status === 'scheduled').length;
  const executedCount = reminders.filter(r => r.status === 'executed').length;
  const cancelledCount = reminders.filter(r => r.status === 'cancelled').length;

  return (
    <div className="h-screen bg-[var(--agyn-bg-light)] flex flex-col">
      {/* Showcase Navigation - NOT PART OF FINAL SCREEN */}
      {onBack && (
        <div className="h-[40px] bg-[var(--agyn-dark)] border-b border-[var(--agyn-border-subtle)] flex items-center px-4 gap-3">
          <IconButton icon={<ArrowLeft />} onClick={onBack} variant="ghost" size="sm" />
          <span className="text-sm text-white">Reminders</span>
        </div>
      )}

      {/* Main Screen Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <Sidebar 
          selectedMenuItem={selectedMenuItem}
          onMenuItemSelect={onMenuItemSelect}
        />

        {/* Main Content */}
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
            <div className="flex items-center gap-2">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1.5 text-xs rounded-md transition-all ${
                  statusFilter === 'all'
                    ? 'bg-[var(--agyn-blue)]/10 text-[var(--agyn-blue)]'
                    : 'text-[var(--agyn-text-subtle)] hover:bg-[var(--agyn-bg-light)]'
                }`}
              >
                All ({reminders.length})
              </button>
              <button
                onClick={() => setStatusFilter('scheduled')}
                className={`px-3 py-1.5 text-xs rounded-md transition-all ${
                  statusFilter === 'scheduled'
                    ? 'bg-[var(--agyn-status-pending)]/10 text-[var(--agyn-status-pending)]'
                    : 'text-[var(--agyn-text-subtle)] hover:bg-[var(--agyn-bg-light)]'
                }`}
              >
                Scheduled ({scheduledCount})
              </button>
              <button
                onClick={() => setStatusFilter('executed')}
                className={`px-3 py-1.5 text-xs rounded-md transition-all ${
                  statusFilter === 'executed'
                    ? 'bg-[var(--agyn-status-finished)]/10 text-[var(--agyn-status-finished)]'
                    : 'text-[var(--agyn-text-subtle)] hover:bg-[var(--agyn-bg-light)]'
                }`}
              >
                Executed ({executedCount})
              </button>
              <button
                onClick={() => setStatusFilter('cancelled')}
                className={`px-3 py-1.5 text-xs rounded-md transition-all ${
                  statusFilter === 'cancelled'
                    ? 'bg-[var(--agyn-text-subtle)]/10 text-[var(--agyn-text-subtle)]'
                    : 'text-[var(--agyn-text-subtle)] hover:bg-[var(--agyn-bg-light)]'
                }`}
              >
                Cancelled ({cancelledCount})
              </button>
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
                {paginatedReminders.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-[var(--agyn-text-subtle)]">
                      No reminders found
                    </td>
                  </tr>
                ) : (
                  paginatedReminders.map((reminder) => {
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
          {totalPages > 1 && (
            <div className="border-t border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)] px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-[var(--agyn-text-subtle)]">
                  Showing {startIndex + 1} to {Math.min(endIndex, filteredReminders.length)} of{' '}
                  {filteredReminders.length} reminders
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 text-sm text-[var(--agyn-text-subtle)] hover:text-[var(--agyn-dark)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`w-8 h-8 rounded-md text-sm transition-all ${
                          currentPage === page
                            ? 'bg-[var(--agyn-blue)]/10 text-[var(--agyn-blue)] font-medium'
                            : 'text-[var(--agyn-text-subtle)] hover:bg-[var(--agyn-bg-light)]'
                        }`}
                      >
                        {page}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setCurrentPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 text-sm text-[var(--agyn-text-subtle)] hover:text-[var(--agyn-dark)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
