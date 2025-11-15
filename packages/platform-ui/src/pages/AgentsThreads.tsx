import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { RunMessageList, type UnifiedRunMessage, type UnifiedListItem, type RunMeta } from '@/components/agents/RunMessageList';
import { ThreadTree } from '@/components/agents/ThreadTree';
import { ThreadStatusFilterSwitch, type ThreadStatusFilter } from '@/components/agents/ThreadStatusFilterSwitch';
import { useThreadRuns } from '@/api/hooks/runs';
import type { ThreadNode } from '@/api/types/agents';
import { runs as runsApi } from '@/api/modules/runs';
import { http } from '@/api/http';
import type { ReminderItem } from '@/api/types/agents';
import { graphSocket } from '@/lib/graph/socket';
import { useNavigate } from 'react-router-dom';
import { ThreadHeader } from '@/components/agents/ThreadHeader';

// Thread list rendering moved into ThreadTree component
type MessageItem = { id: string; kind: 'user' | 'assistant' | 'system' | 'tool'; text?: string | null; source: unknown; createdAt: string };
type SocketMessage = { id: string; kind: 'user' | 'assistant' | 'system' | 'tool'; text: string | null; source: unknown; createdAt: string; runId?: string };
type SocketRun = { id: string; status: 'running' | 'finished' | 'terminated'; createdAt: string; updatedAt: string };

function compareRunMeta(a: RunMeta, b: RunMeta): number {
  const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  if (diff !== 0) return diff;
  return a.id.localeCompare(b.id);
}

function compareUnifiedMessages(a: UnifiedRunMessage, b: UnifiedRunMessage): number {
  const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  if (diff !== 0) return diff;
  return a.id.localeCompare(b.id);
}

function mergeMessageLists(base: UnifiedRunMessage[], additions: UnifiedRunMessage[]): UnifiedRunMessage[] {
  if (additions.length === 0) return base;
  if (base.length === 0) return [...additions].sort(compareUnifiedMessages);
  const byId = new Map<string, UnifiedRunMessage>();
  for (const msg of base) byId.set(msg.id, msg);
  for (const msg of additions) byId.set(msg.id, msg);
  const merged = Array.from(byId.values());
  merged.sort(compareUnifiedMessages);
  return merged;
}

function areMessageListsEqual(a: UnifiedRunMessage[], b: UnifiedRunMessage[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (
      left.id !== right.id ||
      left.role !== right.role ||
      left.text !== right.text ||
      left.createdAt !== right.createdAt ||
      left.side !== right.side ||
      left.runId !== right.runId
    ) {
      return false;
    }
  }
  return true;
}

function toUnifiedFromSocket(message: SocketMessage, runId: string): UnifiedRunMessage {
  const side: 'left' | 'right' = message.kind === 'assistant' || message.kind === 'tool' ? 'right' : 'left';
  return {
    id: message.id,
    role: message.kind,
    text: message.text,
    source: message.source,
    createdAt: message.createdAt,
    side,
    runId,
  };
}

async function fetchRunMessages(runId: string): Promise<UnifiedRunMessage[]> {
  const [input, injected, output] = await Promise.all([
    runsApi.messages(runId, 'input'),
    runsApi.messages(runId, 'injected'),
    runsApi.messages(runId, 'output'),
  ]);
  const mapItems = (items: MessageItem[], side: 'left' | 'right'): UnifiedRunMessage[] =>
    items.map((m) => ({ id: m.id, role: m.kind, text: m.text, source: m.source, createdAt: m.createdAt, side, runId }));
  const combined = [...mapItems(input.items, 'left'), ...mapItems(injected.items, 'left'), ...mapItems(output.items, 'right')];
  combined.sort(compareUnifiedMessages);
  return combined;
}

export function AgentsThreads() {
  const [selectedThreadId, setSelectedThreadId] = useState<string | undefined>(undefined);
  const [selectedThread, setSelectedThread] = useState<ThreadNode | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<ThreadStatusFilter>('open');
  // No run selection in new UX (removed)
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const remindersQueryKey = ['agents', 'threads', selectedThreadId ?? 'none', 'reminders', 'active'] as const;
  const remindersQ = useQuery({
    enabled: !!selectedThreadId,
    queryKey: remindersQueryKey,
    queryFn: async () => {
      const id = selectedThreadId as string;
      return http.get<{ items: ReminderItem[] }>(`/api/agents/reminders?filter=active&threadId=${encodeURIComponent(id)}`);
    },
    refetchOnWindowFocus: false,
  });
  const reminders = useMemo<ReminderItem[]>(() => {
    const items = remindersQ.data?.items ?? [];
    if (!selectedThreadId) return [];
    return items.filter((reminder) => reminder.threadId === selectedThreadId);
  }, [remindersQ.data, selectedThreadId]);
  const nearestReminder = useMemo(() => {
    if (!reminders.length) return null;
    return reminders.reduce<ReminderItem>((earliest, item) => {
      return new Date(item.at).getTime() < new Date(earliest.at).getTime() ? item : earliest;
    }, reminders[0]);
  }, [reminders]);
  const invalidateReminders = useCallback(() => {
    if (!selectedThreadId) return;
    queryClient.invalidateQueries({ queryKey: ['agents', 'threads', selectedThreadId, 'reminders', 'active'] });
  }, [queryClient, selectedThreadId]);

  // Cast through unknown to align differing RunMeta shapes between API and UI list types
  const runsQ = useThreadRuns(selectedThreadId) as unknown as UseQueryResult<{ items: RunMeta[] }, Error>;

  const runs: RunMeta[] = useMemo(() => {
    const list = runsQ.data?.items ?? [];
    return [...list].sort(compareRunMeta);
  }, [runsQ.data]);
  const latestRun = runs.length > 0 ? runs[runs.length - 1] : null;
  const showCountdown = Boolean(selectedThreadId && latestRun?.status === 'finished' && nearestReminder && !remindersQ.isError);

  const [runMessages, setRunMessages] = useState<Record<string, UnifiedRunMessage[]>>({});
  const [loadError, setLoadError] = useState<Error | null>(null);

  const pendingMessages = useRef<Map<string, UnifiedRunMessage[]>>(new Map());
  const seenMessageIds = useRef<Map<string, Set<string>>>(new Map());
  const runIdsRef = useRef<Set<string>>(new Set());

  // Reset cache on thread change
  useEffect(() => {
    setRunMessages({});
    setLoadError(null);
    pendingMessages.current.clear();
    seenMessageIds.current.clear();
    runIdsRef.current = new Set();
    if (!selectedThreadId) {
      setSelectedThread(undefined);
    }
  }, [selectedThreadId]);

  useEffect(() => {
    runIdsRef.current = new Set(runs.map((run) => run.id));
    for (const run of runs) {
      if (!seenMessageIds.current.has(run.id)) seenMessageIds.current.set(run.id, new Set());
    }
    for (const key of Array.from(seenMessageIds.current.keys())) {
      if (!runIdsRef.current.has(key)) seenMessageIds.current.delete(key);
    }
    for (const key of Array.from(pendingMessages.current.keys())) {
      if (!runIdsRef.current.has(key)) pendingMessages.current.delete(key);
    }
  }, [runs]);

  const flushPendingForRun = useCallback(
    (runId: string) => {
      const pending = pendingMessages.current.get(runId);
      if (!pending || pending.length === 0) return;
      pendingMessages.current.delete(runId);
      setRunMessages((prev) => {
        const existing = prev[runId] ?? [];
        const merged = mergeMessageLists(existing, pending);
        seenMessageIds.current.set(runId, new Set(merged.map((m) => m.id)));
        if (areMessageListsEqual(existing, merged)) return prev;
        return { ...prev, [runId]: merged };
      });
    },
    [setRunMessages],
  );

  useEffect(() => {
    if (runs.length === 0) return;
    for (const run of runs) flushPendingForRun(run.id);
  }, [runs, flushPendingForRun]);

  useEffect(() => {
    if (!selectedThreadId || runs.length === 0) return;
    let cancelled = false;
    const concurrency = 3;
    let idx = 0;
    let active = 0;

    const queue = runs.map((run) => async () => {
      try {
        const msgs = await fetchRunMessages(run.id);
        if (!cancelled) {
          setRunMessages((prev) => {
            const existing = prev[run.id] ?? [];
            const merged = mergeMessageLists(existing, msgs);
            seenMessageIds.current.set(run.id, new Set(merged.map((m) => m.id)));
            if (areMessageListsEqual(existing, merged)) return prev;
            return { ...prev, [run.id]: merged };
          });
        }
      } catch (e) {
        if (!cancelled) setLoadError(e as Error);
      }
    });

    const kick = () => {
      while (active < concurrency && idx < queue.length) {
        const fn = queue[idx++];
        active++;
        fn().finally(() => {
          active--;
          if (!cancelled) kick();
        });
      }
    };

    kick();
    return () => {
      cancelled = true;
    };
  }, [selectedThreadId, runs]);

  // Subscribe to selected thread room for live updates
  useEffect(() => {
    if (!selectedThreadId) return;
    const room = `thread:${selectedThreadId}`;
    graphSocket.subscribe([room]);
    return () => {
      graphSocket.unsubscribe([room]);
    };
  }, [selectedThreadId]);

  useEffect(() => {
    if (!selectedThreadId) return;
    const offMsg = graphSocket.onMessageCreated(({ message }) => {
      if (!message.runId) return;
      const runId = message.runId;
      const unified = toUnifiedFromSocket(message as SocketMessage, runId);
      const seen = seenMessageIds.current.get(runId) ?? new Set<string>();
      if (seen.has(unified.id)) return;
      seen.add(unified.id);
      seenMessageIds.current.set(runId, seen);

      if (!runIdsRef.current.has(runId)) {
        const buffered = pendingMessages.current.get(runId) ?? [];
        const merged = mergeMessageLists(buffered, [unified]);
        pendingMessages.current.set(runId, merged);
        return;
      }

      setRunMessages((prev) => {
        const existing = prev[runId] ?? [];
        const merged = mergeMessageLists(existing, [unified]);
        seenMessageIds.current.set(runId, new Set(merged.map((m) => m.id)));
        if (areMessageListsEqual(existing, merged)) return prev;
        return { ...prev, [runId]: merged };
      });
    });
    return () => offMsg();
  }, [selectedThreadId]);

  useEffect(() => {
    if (!selectedThreadId) return;
    const key = ['agents', 'threads', selectedThreadId, 'reminders', 'active'] as const;
    const offReminders = graphSocket.onThreadRemindersCount(({ threadId, remindersCount }) => {
      if (threadId !== selectedThreadId) return;
      if (remindersCount === 0) {
        queryClient.setQueryData<{ items: ReminderItem[] }>(key, { items: [] });
      } else {
        invalidateReminders();
      }
    });
    return () => offReminders();
  }, [selectedThreadId, queryClient, invalidateReminders]);

  useEffect(() => {
    if (!selectedThreadId) return;
    const queryKey = ['agents', 'threads', selectedThreadId, 'runs'];
    const offRun = graphSocket.onRunStatusChanged(({ run }) => {
      const next = run as SocketRun;
      queryClient.setQueryData(queryKey, (prev: { items: RunMeta[] } | undefined) => {
        const items = prev?.items ?? [];
        const idx = items.findIndex((r) => r.id === next.id);
        let updated: RunMeta[];
        if (idx >= 0) {
          const existing = items[idx];
          if (existing.status === next.status && existing.updatedAt === next.updatedAt && existing.createdAt === next.createdAt) {
            return prev;
          }
          updated = [...items];
          updated[idx] = { ...existing, status: next.status, createdAt: next.createdAt, updatedAt: next.updatedAt };
        } else {
          updated = [...items, { ...next }];
        }
        updated.sort(compareRunMeta);
        return { items: updated };
      });
      runIdsRef.current.add(next.id);
      if (!seenMessageIds.current.has(next.id)) seenMessageIds.current.set(next.id, new Set());
      flushPendingForRun(next.id);
      if (next.status === 'finished') invalidateReminders();
    });
    return () => offRun();
  }, [selectedThreadId, queryClient, flushPendingForRun, invalidateReminders]);

  useEffect(() => {
    if (!selectedThreadId) return;
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['agents', 'threads', selectedThreadId, 'runs'] });
      invalidateReminders();
    };
    const offReconnect = graphSocket.onReconnected(invalidate);
    return () => offReconnect();
  }, [selectedThreadId, queryClient, invalidateReminders]);

  const unifiedItems: UnifiedListItem[] = useMemo(() => {
    if (!runs.length) return showCountdown && nearestReminder
      ? [
          {
            type: 'reminder',
            reminder: {
              id: nearestReminder.id,
              threadId: nearestReminder.threadId,
              note: nearestReminder.note,
              at: nearestReminder.at,
            },
            onExpire: invalidateReminders,
          },
        ]
      : [];
    const items: UnifiedListItem[] = [];
    for (const run of runs) {
      const msgs = runMessages[run.id] || [];
      const start = msgs[0]?.createdAt ?? run.createdAt;
      const end = msgs[msgs.length - 1]?.createdAt ?? run.updatedAt;
      items.push({ type: 'run_header', run, start, end, durationMs: new Date(end).getTime() - new Date(start).getTime() });
      for (const m of msgs) items.push({ type: 'message', message: m });
    }
    if (showCountdown && nearestReminder) {
      items.push({
        type: 'reminder',
        reminder: {
          id: nearestReminder.id,
          threadId: nearestReminder.threadId,
          note: nearestReminder.note,
          at: nearestReminder.at,
        },
        onExpire: invalidateReminders,
      });
    }
    return items;
  }, [runs, runMessages, showCountdown, nearestReminder, invalidateReminders]);

  // Per-message JSON toggle state
  const [showJson, setShowJson] = useState<Record<string, boolean>>({});
  const toggleJson = (id: string) => setShowJson((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="absolute inset-0 flex min-h-0 min-w-0 flex-col overflow-hidden">
      <div className="shrink-0 border-b px-6 py-3">
        <h1 className="text-xl font-semibold">Agents / Threads</h1>
      </div>

      <div className="flex-1 min-h-0 px-4 py-4 md:px-6 md:py-6">
        <div className="h-full min-h-0 overflow-y-auto md:overflow-hidden" data-testid="mobile-panel">
          <div className="flex h-full min-h-0 flex-col gap-4 md:flex-row">
            <section
              className="flex min-h-0 w-full shrink-0 flex-col border-b md:w-[340px] md:flex-none md:border-b-0 md:border-r"
              data-testid="threads-panel"
            >
              <header className="flex items-center justify-between border-b px-3 py-2 text-sm font-medium">
                <span>Threads</span>
                <ThreadStatusFilterSwitch value={statusFilter} onChange={(v) => setStatusFilter(v)} />
              </header>
              <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
                <ThreadTree
                  status={statusFilter}
                  onSelect={(node) => {
                    setSelectedThreadId(node.id);
                    setSelectedThread(node);
                  }}
                  selectedId={selectedThreadId}
                  onSelectedNodeChange={(node) => setSelectedThread(node)}
                />
              </div>
            </section>

            <section className="flex h-[60vh] min-h-0 min-w-0 flex-col md:h-full md:flex-1" data-testid="messages-panel">
              <ThreadHeader
                thread={selectedThread}
                runsCount={runs.length}
              />
              <div className="flex-1 min-h-0 overflow-hidden px-3 py-2">
                <RunMessageList
                  items={unifiedItems}
                  showJson={showJson}
                  onToggleJson={toggleJson}
                  isLoading={runsQ.isLoading}
                  error={loadError}
                  onViewRunTimeline={(run) => {
                    if (!selectedThreadId) return;
                    navigate(`/agents/threads/${encodeURIComponent(selectedThreadId)}/runs/${encodeURIComponent(run.id)}/timeline`);
                  }}
                />
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
