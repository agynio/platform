import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RunMessageList, type UnifiedRunMessage, type UnifiedListItem, type RunMeta } from '@/components/agents/RunMessageList';
import { ThreadTree } from '@/components/agents/ThreadTree';
import { ThreadStatusFilterSwitch, type ThreadStatusFilter } from '@/components/agents/ThreadStatusFilterSwitch';
import { httpJson } from '@/api/client';

// Thread list rendering moved into ThreadTree component
type MessageItem = { id: string; kind: 'user' | 'assistant' | 'system' | 'tool'; text?: string | null; source: unknown; createdAt: string };

// Use relative base in tests; avoids env dependence
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await httpJson<T>(`/api/${path}`, init, '');
  if (res === undefined) throw new Error('Empty response');
  return res;
}

export function AgentsThreads() {
  const [selectedThreadId, setSelectedThreadId] = useState<string | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<ThreadStatusFilter>('open');
  // No run selection in new UX (removed)

  const runsQ = useQuery<{ items: RunMeta[] }, Error>({
    queryKey: ['agents', 'threads', selectedThreadId, 'runs'],
    enabled: !!selectedThreadId,
    queryFn: async () => api<{ items: RunMeta[] }>(`agents/threads/${selectedThreadId}/runs`),
  });

  const runs: RunMeta[] = useMemo(() => {
    const list = runsQ.data?.items ?? [];
    // sort oldest -> newest
    return [...list].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [runsQ.data]);

  // Helper to fetch all messages for a run
  async function fetchRunMessages(runId: string): Promise<UnifiedRunMessage[]> {
    const [input, injected, output] = await Promise.all([
      api<{ items: MessageItem[] }>(`agents/runs/${runId}/messages?type=input`),
      api<{ items: MessageItem[] }>(`agents/runs/${runId}/messages?type=injected`),
      api<{ items: MessageItem[] }>(`agents/runs/${runId}/messages?type=output`),
    ]);
    const mark = (items: MessageItem[], side: 'left' | 'right'): UnifiedRunMessage[] =>
      items.map((m) => ({ id: m.id, role: m.kind, text: m.text, source: m.source, createdAt: m.createdAt, side, runId }));
    const merged = [...mark(input.items, 'left'), ...mark(injected.items, 'left'), ...mark(output.items, 'right')];
    merged.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return merged;
  }

  // Cache runId -> messages and fetch all runs with a small concurrency cap
  const [runMessages, setRunMessages] = useState<Record<string, UnifiedRunMessage[]>>({});
  const [loadError, setLoadError] = useState<Error | null>(null);

  // Reset cache on thread change
  useEffect(() => {
    setRunMessages({});
    setLoadError(null);
  }, [selectedThreadId]);

  useEffect(() => {
    if (!selectedThreadId || runs.length === 0) return;
    let cancelled = false;
    const concurrency = 3;
    let idx = 0;
    let active = 0;

    const queue = runs.map((run) => async () => {
      try {
        const msgs = await fetchRunMessages(run.id);
        if (!cancelled) setRunMessages((prev) => ({ ...prev, [run.id]: msgs }));
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

  const unifiedItems: UnifiedListItem[] = useMemo(() => {
    if (!runs.length) return [];
    const items: UnifiedListItem[] = [];
    for (const run of runs) {
      const msgs = runMessages[run.id] || [];
      const start = msgs[0]?.createdAt ?? run.createdAt;
      const end = msgs[msgs.length - 1]?.createdAt ?? run.updatedAt;
      items.push({ type: 'run_header', run, start, end, durationMs: new Date(end).getTime() - new Date(start).getTime() });
      for (const m of msgs) items.push({ type: 'message', message: m });
    }
    return items;
  }, [runs, runMessages]);

  // Per-message JSON toggle state
  const [showJson, setShowJson] = useState<Record<string, boolean>>({});
  const toggleJson = (id: string) => setShowJson((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    // Non-scrollable outer page; inner panels handle scroll independently
    <div className="absolute inset-0 flex min-h-0 min-w-0 flex-col overflow-hidden">
      {/* Header bar */}
      <div className="shrink-0 border-b px-4 py-3">
        <h1 className="text-xl font-semibold">Agents / Threads</h1>
      </div>

      {/* Content area */}
      <div className="flex-1 min-h-0 p-4">
        {/* Mobile: single internally scrollable panel wrapper; desktop uses independent panel scrolls */}
        <div className="h-full min-h-0 overflow-y-auto md:overflow-hidden" data-testid="mobile-panel">
          <div className="flex h-full min-h-0 flex-col md:flex-row gap-4">
            {/* Threads tree panel */}
            <div className="flex min-h-0 w-full md:w-96 shrink-0 flex-col overflow-visible md:overflow-hidden border rounded-md" data-testid="threads-panel">
              <div className="border-b px-2 py-2 text-sm font-medium flex items-center gap-3">
                <span>Threads</span>
                <ThreadStatusFilterSwitch value={statusFilter} onChange={(v) => setStatusFilter(v)} />
              </div>
              <div className="flex-1 md:overflow-y-auto p-2">
                <ThreadTree status={statusFilter} onSelect={(id) => setSelectedThreadId(id)} selectedId={selectedThreadId} />
              </div>
            </div>

            {/* Unified messages across all runs panel */}
            <div className="flex h-[60vh] md:h-full min-h-0 min-w-0 md:flex-1 flex-col overflow-visible md:overflow-hidden border rounded-md" data-testid="messages-panel">
              <div className="border-b px-2 py-2 text-sm font-medium">Thread: {selectedThreadId || '(none selected)'}</div>
              <div className="flex-1 min-h-0 p-2">
                <div className="h-full border rounded p-2">
                  <RunMessageList
                    items={unifiedItems}
                    showJson={showJson}
                    onToggleJson={toggleJson}
                    isLoading={runsQ.isLoading}
                    error={loadError}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
