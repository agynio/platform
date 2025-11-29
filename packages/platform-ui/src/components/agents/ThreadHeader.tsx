import { useEffect, useMemo, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { RovingFocusGroup, RovingFocusGroupItem } from '@radix-ui/react-roving-focus';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Boxes } from 'lucide-react';
import { formatDistanceToNow, formatDistanceToNowStrict } from 'date-fns';
import { useThreadMetrics, useThreadReminders, useThreadContainers, useThreadContainersCount } from '@/api/hooks/threads';
import type { ThreadNode, ThreadReminder } from '@/api/types/agents';
import type { ContainerItem } from '@/api/modules/containers';
import { computeAgentDefaultTitle, normalizeAgentName } from '../../utils/agentDisplay';

const defaultMetrics = { remindersCount: 0, containersCount: 0, activity: 'idle' as const, runsCount: 0 };
const badgeButtonClasses = 'rounded border px-3 py-1 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400';
const popoverClasses = 'z-50 w-80 max-w-sm rounded-md border bg-white p-3 shadow-lg focus:outline-none';

function ReminderList({ reminders }: { reminders: ThreadReminder[] }) {
  if (reminders.length === 0) {
    return <div className="text-xs text-gray-500">No active reminders.</div>;
  }
  return (
    <ul className="space-y-2" data-testid="thread-reminders-list" role="list">
      {reminders.map((rem) => {
        const at = new Date(rem.at);
        const valid = Number.isFinite(at.getTime());
        const absolute = valid ? at.toLocaleString() : 'Unknown time';
        const relative = valid ? formatDistanceToNow(at, { addSuffix: true }) : null;
        const note = rem.note?.trim().length ? rem.note.trim() : '(no note)';
        return (
          <li key={rem.id} className="rounded border px-2 py-1 text-xs" role="listitem">
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

function ContainerList({ containers }: { containers: ContainerItem[] }) {
  if (containers.length === 0) {
    return <div className="text-xs text-gray-500">No running containers for this thread.</div>;
  }
  return (
    <RovingFocusGroup orientation="vertical" loop>
      <ul className="space-y-2" data-testid="thread-containers-list" role="list">
        {containers.map((container) => {
          const started = container.startedAt ? new Date(container.startedAt) : null;
          const startedValid = started ? Number.isFinite(started.getTime()) : false;
          const startedLabel = startedValid ? started!.toLocaleString() : 'Unknown start time';
          const uptime = startedValid ? formatDistanceToNowStrict(started!, { addSuffix: true }) : null;
          const lastUsed = container.lastUsedAt ? new Date(container.lastUsedAt) : null;
          const lastUsedValid = lastUsed ? Number.isFinite(lastUsed.getTime()) : false;
          const lastUsedLabel = lastUsedValid ? formatDistanceToNow(lastUsed!, { addSuffix: true }) : null;
          return (
            <RovingFocusGroupItem asChild key={container.containerId}>
              <li
                className="rounded border px-2 py-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                data-testid="thread-containers-item"
                role="listitem"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-gray-800" title={`Role: ${container.role}`}>
                    {container.role}
                  </span>
                  <span className="text-[10px] uppercase tracking-wide text-gray-500">{container.status}</span>
                </div>
                <div className="mt-1 truncate text-gray-600" title={container.image}>
                  Image: {container.image}
                </div>
                <div className="mt-1 text-gray-600" title={`ID: ${container.containerId}`}>
                  ID: {container.containerId.slice(0, 12)}
                </div>
                <div className="mt-1 text-gray-500" title={startedLabel}>
                  Started {uptime ?? startedLabel}
                </div>
                {lastUsedLabel && <div className="text-gray-400">Last active {lastUsedLabel}</div>}
              </li>
            </RovingFocusGroupItem>
          );
        })}
      </ul>
    </RovingFocusGroup>
  );
}

export function ThreadHeader({ thread, runsCount }: { thread: ThreadNode | undefined; runsCount: number }) {
  const threadId = thread?.id;
  const [remindersOpen, setRemindersOpen] = useState(false);
  const [containersOpen, setContainersOpen] = useState(false);

  useEffect(() => {
    setRemindersOpen(false);
    setContainersOpen(false);
  }, [threadId]);

  const metricsQ = useThreadMetrics(threadId);
  const metrics = metricsQ.data ?? thread?.metrics ?? defaultMetrics;

  const effectiveRunsCount = useMemo(() => {
    if (!threadId) return 0;
    const metricRuns = metrics.runsCount ?? 0;
    return Math.max(runsCount, metricRuns);
  }, [threadId, runsCount, metrics.runsCount]);

  const remindersQ = useThreadReminders(threadId, remindersOpen);
  const reminders = remindersQ.data?.items ?? [];

  const containersBadgeQ = useThreadContainersCount(threadId);
  const containersQ = useThreadContainers(threadId, containersOpen);
  const containers = containersQ.data?.items ?? [];
  const containersCount = containersQ.data ? containers.length : containersBadgeQ.data ?? 0;

  const summary = useMemo(() => {
    if (!thread) return '(none selected)';
    const text = thread.summary?.trim() ?? '';
    return text.length > 0 ? text : '(no summary yet)';
  }, [thread]);

  const explicitTitle = normalizeAgentName(thread?.agentTitle);
  const computedDefaultTitle = computeAgentDefaultTitle(thread?.agentName, thread?.agentRole);
  const agentTitle = explicitTitle ?? computedDefaultTitle;
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

  const handleRemindersRetry = () => {
    Promise.resolve(remindersQ.refetch()).catch(() => {});
  };
  const handleContainersRetry = () => {
    Promise.resolve(containersQ.refetch()).catch(() => {});
  };

  return (
    <header className="border-b px-3 py-3 text-sm" data-testid="thread-header">
      <div className="flex flex-col gap-3">
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
          <div className="mt-1 text-xs text-gray-500">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
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
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-600" data-testid="thread-header-stats">
            <div className="rounded border px-3 py-1 text-gray-700" aria-label={`Runs total: ${effectiveRunsCount}`}>
              Runs {effectiveRunsCount}
            </div>
            <Popover.Root open={containersOpen} onOpenChange={setContainersOpen}>
              <Popover.Trigger asChild>
                <button
                  type="button"
                  disabled={!threadId}
                  className={badgeButtonClasses}
                  aria-label={`Running containers: ${containersCount}`}
                  data-testid="thread-containers-trigger"
                >
                  <span className="flex items-center gap-1">
                    <Boxes className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Containers {containersCount}</span>
                  </span>
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content side="bottom" align="start" sideOffset={8} className={popoverClasses} data-testid="thread-containers-popover">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-sm font-semibold text-gray-900">Running Containers</div>
                    <VisuallyHidden>Thread containers</VisuallyHidden>
                  </div>
                  {containersQ.isLoading && <div className="text-xs text-gray-500">Loading…</div>}
                  {containersQ.error && (
                    <div className="space-y-2" role="alert">
                      <div className="text-xs text-red-600">Unable to load containers.</div>
                      <button type="button" className="text-xs font-medium text-blue-600 hover:underline" onClick={handleContainersRetry}>
                        Retry
                      </button>
                    </div>
                  )}
                  {!containersQ.isLoading && !containersQ.error && <ContainerList containers={containers} />}
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
            <Popover.Root open={remindersOpen} onOpenChange={setRemindersOpen}>
              <Popover.Trigger asChild>
                <button
                  type="button"
                  disabled={!threadId}
                  className={badgeButtonClasses}
                  aria-label={`Active reminders: ${metrics.remindersCount}`}
                  data-testid="thread-reminders-trigger"
                >
                  Reminders {metrics.remindersCount}
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content side="bottom" align="start" sideOffset={8} className={popoverClasses} data-testid="thread-reminders-popover">
                  <div className="mb-2 text-sm font-semibold text-gray-900">Active Reminders</div>
                  {remindersQ.isLoading && <div className="text-xs text-gray-500">Loading…</div>}
                  {remindersQ.error && (
                    <div className="space-y-2" role="alert">
                      <div className="text-xs text-red-600">Unable to load reminders.</div>
                      <button type="button" className="text-xs font-medium text-blue-600 hover:underline" onClick={handleRemindersRetry}>
                        Retry
                      </button>
                    </div>
                  )}
                  {!remindersQ.isLoading && !remindersQ.error && <ReminderList reminders={reminders} />}
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          </div>
        </div>
      </div>
    </header>
  );
}
