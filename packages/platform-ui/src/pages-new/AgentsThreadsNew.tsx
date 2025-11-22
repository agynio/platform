import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ThreadsScreen,
  type ThreadsScreenProps,
  type Thread as ThreadsScreenThread,
} from '@agyn/ui-new';
import { threads as threadsApi } from '@/api/modules/threads';
import { runs as runsApi } from '@/api/modules/runs';
import { listContainers, type ContainerItem } from '@/api/modules/containers';
import type { ThreadNode, RunMeta, ReminderItem } from '@/api/types/agents';
import { graphSocket } from '@/lib/graph/socket';

type ThreadFilterMode = 'all' | 'open' | 'closed';

type UnifiedRunMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  text: string | null;
  createdAt: string;
};

type ThreadMetricsState = {
  activity: 'working' | 'waiting' | 'idle';
  remindersCount: number;
};

const DEFAULT_METRICS: ThreadMetricsState = {
  activity: 'idle',
  remindersCount: 0,
};

function compareRunMeta(a: RunMeta, b: RunMeta): number {
  const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  if (diff !== 0) return diff;
  return a.id.localeCompare(b.id);
}

async function fetchRunMessages(runId: string): Promise<UnifiedRunMessage[]> {
  const [input, injected, output] = await Promise.all([
    runsApi.messages(runId, 'input'),
    runsApi.messages(runId, 'injected'),
    runsApi.messages(runId, 'output'),
  ]);
  const mapItems = (items: UnifiedRunMessage[], messages: UnifiedRunMessage[]) => {
    items.push(...messages);
    return items;
  };

  const toUnified = (items: Array<{ id: string; kind: UnifiedRunMessage['role']; text?: string | null; createdAt: string }>) =>
    items.map((item) => ({
      id: item.id,
      role: item.kind,
      text: item.text ?? null,
      createdAt: item.createdAt,
    }));

  const collected: UnifiedRunMessage[] = [];
  mapItems(collected, toUnified(input.items ?? []));
  mapItems(collected, toUnified(injected.items ?? []));
  mapItems(collected, toUnified(output.items ?? []));

  collected.sort((a, b) => {
    const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (diff !== 0) return diff;
    return a.id.localeCompare(b.id);
  });

  return collected;
}

function mergeMessageLists(base: UnifiedRunMessage[], additions: UnifiedRunMessage[]): UnifiedRunMessage[] {
  if (additions.length === 0) return base;
  if (base.length === 0) {
    return [...additions].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }
  const byId = new Map<string, UnifiedRunMessage>();
  for (const msg of base) byId.set(msg.id, msg);
  for (const msg of additions) byId.set(msg.id, msg);
  const merged = Array.from(byId.values());
  merged.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return merged;
}

function activityToStatus(activity: 'working' | 'waiting' | 'idle', isOpen: boolean): ThreadsScreenThread['status'] {
  if (!isOpen) return 'finished';
  switch (activity) {
    case 'working':
      return 'running';
    case 'waiting':
      return 'pending';
    default:
      return 'finished';
  }
}

function formatDuration(createdAt: string, updatedAt: string): string {
  const start = new Date(createdAt).getTime();
  const end = new Date(updatedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return '--';
  const diff = Math.max(0, end - start);
  const seconds = Math.floor(diff / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hours}h ${remMins}m`;
  }
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function AgentsThreadsNew() {
  const [filter, setFilter] = useState<ThreadFilterMode>('all');
  const [threads, setThreads] = useState<ThreadNode[]>([]);
  const [threadMetrics, setThreadMetrics] = useState<Map<string, ThreadMetricsState>>(new Map());
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [selectedThreadId, setSelectedThreadId] = useState<string | undefined>();
  const [runs, setRuns] = useState<RunMeta[]>([]);
  const [runMessages, setRunMessages] = useState<Map<string, UnifiedRunMessage[]>>(new Map());
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [containers, setContainers] = useState<ContainerItem[]>([]);

  const pendingMessagesRef = useRef<Map<string, UnifiedRunMessage[]>>(new Map());
  const seenMessageIdsRef = useRef<Map<string, Set<string>>>(new Map());
  const subscribedRunRoomsRef = useRef<Set<string>>(new Set());

  const flushPendingForRun = useCallback((runId: string, base: UnifiedRunMessage[]) => {
    const pending = pendingMessagesRef.current.get(runId);
    if (!pending || pending.length === 0) return base;
    pendingMessagesRef.current.delete(runId);
    const merged = mergeMessageLists(base, pending);
    seenMessageIdsRef.current.set(runId, new Set(merged.map((msg) => msg.id)));
    return merged;
  }, []);

  const reloadThreads = useCallback(async () => {
    setThreadsLoading(true);
    try {
      const res = await threadsApi.roots(filter, 100);
      const items = res.items ?? [];
      setThreads(items);
      setThreadMetrics(() => {
        const metrics = new Map<string, ThreadMetricsState>();
        for (const item of items) {
          if (item.metrics) {
            metrics.set(item.id, {
              activity: item.metrics.activity,
              remindersCount: item.metrics.remindersCount,
            });
          }
        }
        return metrics;
      });
      if (!selectedThreadId && items.length) {
        setSelectedThreadId(items[0].id);
      } else if (selectedThreadId && !items.some((item) => item.id === selectedThreadId)) {
        setSelectedThreadId(items[0]?.id);
      }
    } finally {
      setThreadsLoading(false);
    }
  }, [filter, selectedThreadId]);

  useEffect(() => {
    reloadThreads().catch(() => {});
  }, [reloadThreads]);

  useEffect(() => {
    graphSocket.subscribe(['threads']);
    const offCreated = graphSocket.onThreadCreated(({ thread }) => {
      setThreads((prev) => {
        const matchesFilter =
          filter === 'all' || (filter === 'open' ? thread.status === 'open' : thread.status === 'closed');
        if (!matchesFilter) return prev;
        const exists = prev.some((item) => item.id === thread.id);
        if (exists) return prev;
        const node: ThreadNode = {
          id: thread.id,
          alias: thread.alias,
          summary: thread.summary,
          status: thread.status,
          parentId: thread.parentId,
          createdAt: thread.createdAt,
          metrics: { remindersCount: 0, containersCount: 0, activity: 'idle', runsCount: 0 },
          agentTitle: thread.alias || 'Agent',
        };
        return [node, ...prev];
      });
    });

    const offUpdated = graphSocket.onThreadUpdated(({ thread }) => {
      setThreads((prev) =>
        prev.map((item) =>
          item.id === thread.id
            ? {
                ...item,
                summary: thread.summary,
                status: thread.status,
                createdAt: thread.createdAt,
              }
            : item,
        ),
      );
    });

    const offActivity = graphSocket.onThreadActivityChanged(({ threadId, activity }) => {
      setThreadMetrics((prev) => {
        const next = new Map(prev);
        const existing = next.get(threadId) ?? DEFAULT_METRICS;
        next.set(threadId, { ...existing, activity });
        return next;
      });
    });

    const offReminders = graphSocket.onThreadRemindersCount(({ threadId, remindersCount }) => {
      setThreadMetrics((prev) => {
        const next = new Map(prev);
        const existing = next.get(threadId) ?? DEFAULT_METRICS;
        next.set(threadId, { ...existing, remindersCount });
        return next;
      });
    });

    const offReconnect = graphSocket.onReconnected(() => {
      reloadThreads().catch(() => {});
    });

    return () => {
      offCreated();
      offUpdated();
      offActivity();
      offReminders();
      offReconnect();
      graphSocket.unsubscribe(['threads']);
    };
  }, [filter, reloadThreads]);

  const subscribeToRunRooms = useCallback((runIds: string[]) => {
    const toSubscribe: string[] = [];
    const subscribed = subscribedRunRoomsRef.current;
    for (const id of runIds) {
      const room = `run:${id}`;
      if (subscribed.has(room)) continue;
      subscribed.add(room);
      toSubscribe.push(room);
    }
    if (toSubscribe.length) {
      graphSocket.subscribe(toSubscribe);
    }
  }, []);

  const unsubscribeAllRunRooms = useCallback(() => {
    const subscribed = subscribedRunRoomsRef.current;
    if (subscribed.size === 0) return;
    const rooms = Array.from(subscribed);
    subscribed.clear();
    graphSocket.unsubscribe(rooms);
  }, []);

  const loadThreadDetails = useCallback(
    async (threadId: string) => {
      setRuns([]);
      setRunMessages(new Map());
      setReminders([]);
      setContainers([]);
      pendingMessagesRef.current.clear();
      seenMessageIdsRef.current.clear();
      unsubscribeAllRunRooms();

      const [runsResponse, remindersResponse, containersResponse] = await Promise.all([
        runsApi.listByThread(threadId).catch(() => ({ items: [] })),
        threadsApi.reminders(threadId).catch(() => ({ items: [] })),
        listContainers({ threadId }).catch(() => ({ items: [] })),
      ]);

      const orderedRuns = [...(runsResponse.items ?? [])].sort(compareRunMeta);
      setRuns(orderedRuns);

      const runIds = orderedRuns.map((run) => run.id);
      subscribeToRunRooms(runIds);

      const messagesMap = new Map<string, UnifiedRunMessage[]>();
      for (const run of orderedRuns) {
        try {
          const messages = await fetchRunMessages(run.id);
          const merged = flushPendingForRun(run.id, messages);
          messagesMap.set(run.id, merged);
          seenMessageIdsRef.current.set(run.id, new Set(merged.map((msg) => msg.id)));
        } catch {
          messagesMap.set(run.id, []);
        }
      }
      setRunMessages(messagesMap);

      setReminders(remindersResponse.items ?? []);
      setContainers(containersResponse.items ?? []);
    },
    [subscribeToRunRooms, unsubscribeAllRunRooms, flushPendingForRun],
  );

  useEffect(() => {
    if (!selectedThreadId) return;
    loadThreadDetails(selectedThreadId).catch(() => {});
  }, [selectedThreadId, loadThreadDetails]);

  useEffect(() => () => {
    unsubscribeAllRunRooms();
  }, [unsubscribeAllRunRooms]);

  useEffect(() => {
    if (!selectedThreadId) return;
    const threadRoom = `thread:${selectedThreadId}`;
    graphSocket.subscribe([threadRoom]);

    const handleMessageCreated = ({ threadId, message }: { threadId: string; message: { id: string; kind: UnifiedRunMessage['role']; text?: string | null; createdAt: string; runId?: string } }) => {
      if (threadId !== selectedThreadId || !message.runId) return;
      const runId = message.runId;
      const unified: UnifiedRunMessage = {
        id: message.id,
        role: message.kind,
        text: message.text ?? null,
        createdAt: message.createdAt,
      };
      const seenForRun = seenMessageIdsRef.current.get(runId) ?? new Set<string>();
      if (seenForRun.has(unified.id)) return;
      seenForRun.add(unified.id);
      seenMessageIdsRef.current.set(runId, seenForRun);

      let applied = false;
      setRunMessages((prev) => {
        if (!prev.has(runId)) {
          const pending = pendingMessagesRef.current.get(runId) ?? [];
          pendingMessagesRef.current.set(runId, mergeMessageLists(pending, [unified]));
          applied = false;
          return prev;
        }
        const next = new Map(prev);
        const existing = next.get(runId) ?? [];
        next.set(runId, mergeMessageLists(existing, [unified]));
        applied = true;
        return next;
      });
      if (!applied) return;
    };

    const offMessage = graphSocket.onMessageCreated(handleMessageCreated);

    const offRunStatus = graphSocket.onRunStatusChanged(({ threadId, run }) => {
      if (threadId !== selectedThreadId) return;
      const runMeta: RunMeta = {
        id: run.id,
        threadId: run.threadId ?? threadId,
        status: run.status,
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
      };
      setRuns((prev) => {
        const idx = prev.findIndex((item) => item.id === runMeta.id);
        if (idx === -1) {
          const next = [...prev, runMeta];
          next.sort(compareRunMeta);
          subscribeToRunRooms([runMeta.id]);
          fetchRunMessages(runMeta.id)
            .then((messages) => {
              setRunMessages((current) => {
                const updated = new Map(current);
                updated.set(runMeta.id, messages);
                return updated;
              });
              seenMessageIdsRef.current.set(runMeta.id, new Set(messages.map((msg) => msg.id)));
            })
            .catch(() => {});
          return next;
        }
        const existing = prev[idx];
        if (existing.status === runMeta.status && existing.updatedAt === runMeta.updatedAt) return prev;
        const next = [...prev];
        next[idx] = { ...existing, status: runMeta.status, updatedAt: runMeta.updatedAt, createdAt: runMeta.createdAt };
        return next;
      });
    });

    const offThreadReminders = graphSocket.onThreadRemindersCount(({ threadId, remindersCount }) => {
      if (threadId !== selectedThreadId) return;
      if (remindersCount === 0) {
        setReminders([]);
      } else {
        threadsApi.reminders(threadId).then((res) => setReminders(res.items ?? [])).catch(() => {});
      }
    });

    const offRunEvent = graphSocket.onRunEvent(({ runId, event }) => {
      if (!runId || event.threadId !== selectedThreadId) return;
      if (!event.message) return;
      const messageId = event.message.messageId;
      if (!messageId) return;
      const unified: UnifiedRunMessage = {
        id: messageId,
        role: event.message.role === 'tool' ? 'tool' : event.message.role === 'assistant' ? 'assistant' : event.message.role === 'system' ? 'system' : 'user',
        text: event.message.text ?? null,
        createdAt: event.message.createdAt || event.ts,
      };
      const seenForRun = seenMessageIdsRef.current.get(runId) ?? new Set<string>();
      if (seenForRun.has(unified.id)) return;
      seenForRun.add(unified.id);
      seenMessageIdsRef.current.set(runId, seenForRun);
      let applied = false;
      setRunMessages((prev) => {
        if (!prev.has(runId)) {
          const pending = pendingMessagesRef.current.get(runId) ?? [];
          pendingMessagesRef.current.set(runId, mergeMessageLists(pending, [unified]));
          applied = false;
          return prev;
        }
        const next = new Map(prev);
        const existing = next.get(runId) ?? [];
        next.set(runId, mergeMessageLists(existing, [unified]));
        applied = true;
        return next;
      });
      if (!applied) return;
    });

    const offReconnect = graphSocket.onReconnected(() => {
      loadThreadDetails(selectedThreadId).catch(() => {});
    });

    return () => {
      offMessage();
      offRunStatus();
      offThreadReminders();
      offRunEvent();
      offReconnect();
      graphSocket.unsubscribe([threadRoom]);
    };
  }, [selectedThreadId, subscribeToRunRooms, loadThreadDetails]);

  const threadsForUi = useMemo(() => {
    return threads.map<ThreadsScreenThread>((thread) => {
      const metrics = threadMetrics.get(thread.id) ?? DEFAULT_METRICS;
      const isOpen = thread.status !== 'closed';
      return {
        id: thread.id,
        summary: thread.summary ?? thread.alias ?? thread.id,
        agentName: thread.agentTitle ?? thread.alias ?? 'Agent',
        createdAt: new Date(thread.createdAt).toLocaleString(),
        status: activityToStatus(metrics.activity, isOpen),
        isOpen,
      };
    });
  }, [threads, threadMetrics]);

  const runsForUi = useMemo<ThreadsScreenProps['runs']>(() => {
    return runs.map((run) => {
      const messages = runMessages.get(run.id) ?? [];
      const status: 'running' | 'finished' | 'failed' | 'pending' | 'terminated' =
        run.status === 'terminated' ? 'terminated' : run.status;
      return {
        id: run.id,
        status,
        duration: formatDuration(run.createdAt, run.updatedAt),
        messages: messages.map((msg) => ({
          id: msg.id,
          role: msg.role,
          content: msg.text ?? '',
          timestamp: formatTimestamp(msg.createdAt),
        })),
      };
    });
  }, [runs, runMessages]);

  const remindersForUi = useMemo<ThreadsScreenProps['reminders']>(() => {
    return reminders.map((reminder) => ({
      id: reminder.id,
      title: reminder.note ?? 'Reminder',
      time: new Date(reminder.at).toLocaleString(),
    }));
  }, [reminders]);

  const containersForUi = useMemo<ThreadsScreenProps['containers']>(() => {
    return containers.map((container) => ({
      id: container.containerId,
      name: container.image,
      status:
        container.status === 'running'
          ? 'running'
          : container.status === 'failed'
            ? 'failed'
            : container.status === 'terminating'
              ? 'terminated'
              : 'pending',
    }));
  }, [containers]);

  return (
    <ThreadsScreen
      threads={threadsForUi}
      runs={runsForUi}
      reminders={remindersForUi}
      containers={containersForUi}
      selectedThreadId={selectedThreadId}
      onSelectThread={(id) => setSelectedThreadId(id)}
      onThreadFilterChange={setFilter}
      isLoadingThreads={threadsLoading}
    />
  );
}
