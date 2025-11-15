import { useEffect, useMemo, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { formatDistanceToNow } from 'date-fns';
import { useThreadMetrics, useThreadReminders } from '@/api/hooks/threads';
import type { ThreadNode, ThreadReminder } from '@/api/types/agents';

const defaultMetrics = { remindersCount: 0, activity: 'idle' as const, runsCount: 0 };

function ReminderList({ reminders }: { reminders: ThreadReminder[] }) {
  if (reminders.length === 0) {
    return <div className="text-xs text-gray-500">No active reminders</div>;
  }
  return (
    <ul className="space-y-2" data-testid="thread-reminders-list">
      {reminders.map((rem) => {
        const at = new Date(rem.at);
        const valid = Number.isFinite(at.getTime());
        const absolute = valid ? at.toLocaleString() : 'Invalid date';
        const relative = valid ? formatDistanceToNow(at, { addSuffix: true }) : null;
        const note = rem.note?.trim().length ? rem.note.trim() : '(no note)';
        return (
          <li key={rem.id} className="rounded border px-2 py-1 text-xs">
            <div className="font-medium text-gray-800" title={note}>
              {note}
            </div>
            <div className="text-gray-600" title={absolute}>
              Scheduled {absolute}
            </div>
            {relative && <div className="text-gray-400">{relative}</div>}
          </li>
        );
      })}
    </ul>
  );
}

export function ThreadHeader({ thread, runsCount }: { thread: ThreadNode | undefined; runsCount: number }) {
  const threadId = thread?.id;
  const [remindersOpen, setRemindersOpen] = useState(false);
  useEffect(() => {
    setRemindersOpen(false);
  }, [threadId]);

  const metricsQ = useThreadMetrics(threadId);
  const metrics = metricsQ.data ?? thread?.metrics ?? defaultMetrics;
  const activityClass = metrics.activity === 'working' ? 'bg-green-500' : metrics.activity === 'waiting' ? 'bg-yellow-500' : 'bg-blue-500';

  const effectiveRunsCount = useMemo(() => {
    if (!threadId) return 0;
    const metricRuns = metrics.runsCount ?? 0;
    return Math.max(runsCount, metricRuns);
  }, [threadId, runsCount, metrics.runsCount]);

  const remindersQ = useThreadReminders(threadId, remindersOpen);
  const reminders = remindersQ.data?.items ?? [];

  const summary = useMemo(() => {
    if (!thread) return '(none selected)';
    const text = thread.summary?.trim() ?? '';
    return text.length > 0 ? text : '(no summary yet)';
  }, [thread]);

  const agentTitle = thread?.agentTitle?.trim().length ? thread.agentTitle.trim() : '(unknown agent)';
  const createdAt = thread?.createdAt ? new Date(thread.createdAt) : null;
  const createdAtLabel = createdAt && Number.isFinite(createdAt.getTime()) ? createdAt.toLocaleString() : null;
  const createdRelative = createdAt && Number.isFinite(createdAt.getTime()) ? formatDistanceToNow(createdAt, { addSuffix: true }) : null;
  const statusLabel = thread?.status ? thread.status.charAt(0).toUpperCase() + thread.status.slice(1) : 'Open';

  if (!thread) {
    return (
      <header className="border-b px-3 py-3 text-sm text-gray-500" data-testid="thread-header">
        Select a thread to view details.
      </header>
    );
  }

  return (
    <header className="border-b px-3 py-3 text-sm" data-testid="thread-header">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-semibold text-gray-900" title={summary} data-testid="thread-header-summary">
              {summary}
            </h2>
            {thread.alias && (
              <span className="truncate text-xs text-gray-400" title={`Alias: ${thread.alias}`}>
                #{thread.alias}
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
            <span title={agentTitle}>{agentTitle}</span>
            {createdAtLabel && (
              <>
                <span aria-hidden="true">•</span>
                <span title={createdAtLabel}>Created {createdRelative ?? createdAtLabel}</span>
              </>
            )}
            <span aria-hidden="true">•</span>
            <span>Status: {statusLabel}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-2 rounded border px-3 py-1" aria-label={`Activity: ${metrics.activity}`}>
            <span className={`inline-block h-2 w-2 rounded-full ${activityClass}`} aria-hidden="true" />
            <span className="capitalize text-gray-700">{metrics.activity}</span>
          </div>
          <div className="rounded border px-3 py-1 text-gray-700" aria-label={`Runs total: ${effectiveRunsCount}`}>
            Runs {effectiveRunsCount}
          </div>
          <Popover.Root open={remindersOpen} onOpenChange={setRemindersOpen}>
            <Popover.Trigger asChild>
              <button
                type="button"
                disabled={!threadId}
                className="rounded border px-3 py-1 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400"
                aria-label={`Active reminders: ${metrics.remindersCount}`}
                data-testid="thread-reminders-trigger"
              >
                Reminders {metrics.remindersCount}
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                side="bottom"
                align="end"
                sideOffset={8}
                className="z-50 w-72 rounded-md border bg-white p-3 shadow-lg focus:outline-none"
                data-testid="thread-reminders-popover"
              >
                <div className="mb-2 text-sm font-semibold text-gray-900">Active Reminders</div>
                {remindersQ.isLoading && <div className="text-xs text-gray-500">Loading…</div>}
                {remindersQ.error && (
                  <div className="text-xs text-red-600" role="alert">{(remindersQ.error as Error).message}</div>
                )}
                {!remindersQ.isLoading && !remindersQ.error && <ReminderList reminders={reminders} />}
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
      </div>
    </header>
  );
}
