import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RunMessageList, type UnifiedRunMessage, type UnifiedListItem, type RunMeta } from '@/components/agents/RunMessageList';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3010';

type ThreadItem = { id: string; alias: string; createdAt: string };
type MessageItem = { id: string; kind: 'user' | 'assistant' | 'system' | 'tool'; text?: string | null; source: unknown; createdAt: string };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${API_BASE}/api/${path}`, { headers: { 'Content-Type': 'application/json' }, ...(init || {}) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

export function AgentsThreads() {
  const [selectedThreadId, setSelectedThreadId] = useState<string | undefined>(undefined);
  // No run selection in new UX (removed)

  const threadsQ = useQuery({
    queryKey: ['agents', 'threads'],
    queryFn: async () => api<{ items: ThreadItem[] }>(`agents/threads`),
  });

  const runsQ = useQuery<{ items: RunMeta[] }, Error>({
    queryKey: ['agents', 'threads', selectedThreadId, 'runs'],
    enabled: !!selectedThreadId,
    queryFn: async () => api<{ items: RunMeta[] }>(`agents/threads/${selectedThreadId}/runs`),
  });

  const threads = threadsQ.data?.items || [];
  const runs: RunMeta[] = useMemo(() => {
    const list = runsQ.data?.items ?? [];
    // sort oldest -> newest
    return [...list].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [runsQ.data]);

  // Manage progressive loading of runs' messages: start from latest run
  const [loadedCount, setLoadedCount] = useState(0); // how many latest runs are loaded
  const latestRunIndex = runs.length - 1;

  useEffect(() => {
    // Reset when thread changes
    setLoadedCount(runs.length > 0 ? 1 : 0);
  }, [selectedThreadId, runs.length]);

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

  // Cache runId -> messages in local state; useQuery could be used, but simple state works here without backend changes
  const [runMessages, setRunMessages] = useState<Record<string, UnifiedRunMessage[]>>({});
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<Error | null>(null);

  // load latest on change
  const initialLoadedRef = useRef(false);
  useEffect(() => {
    if (!selectedThreadId || runs.length === 0) return;
    if (initialLoadedRef.current) return;
    const latest = runs[latestRunIndex];
    if (!latest) return;
    initialLoadedRef.current = true;
    setLoadingMore(true);
    fetchRunMessages(latest.id)
      .then((msgs) => setRunMessages((prev) => ({ ...prev, [latest.id]: msgs })))
      .catch((e: Error) => setLoadError(e))
      .finally(() => setLoadingMore(false));
  }, [selectedThreadId, runs, latestRunIndex]);

  const hasMoreAbove = loadedCount < runs.length;
  const loadMoreAbove = () => {
    if (!hasMoreAbove || loadingMore) return;
    const nextIndexFromEnd = runs.length - 1 - loadedCount; // previous run index
    const run = runs[nextIndexFromEnd];
    if (!run) return;
    setLoadingMore(true);
    fetchRunMessages(run.id)
      .then((msgs) => {
        setRunMessages((prev) => ({ ...prev, [run.id]: msgs }));
        setLoadedCount((c) => c + 1);
      })
      .catch((e: Error) => setLoadError(e))
      .finally(() => setLoadingMore(false));
  };

  const unifiedItems: UnifiedListItem[] = useMemo(() => {
    if (!runs.length) return [];
    const latestSlice = runs.slice(Math.max(0, runs.length - loadedCount)); // the loaded runs (oldest to newest within loaded set)
    const items: UnifiedListItem[] = [];
    for (const run of latestSlice) {
      const msgs = runMessages[run.id] || [];
      const start = msgs[0]?.createdAt ?? run.createdAt;
      const end = msgs[msgs.length - 1]?.createdAt ?? run.updatedAt;
      items.push({ type: 'run_header', run, start, end, durationMs: new Date(end).getTime() - new Date(start).getTime() });
      for (const m of msgs) items.push({ type: 'message', message: m });
    }
    return items;
  }, [runs, loadedCount, runMessages]);

  // Per-message JSON toggle state
  const [showJson, setShowJson] = useState<Record<string, boolean>>({});
  const toggleJson = (id: string) => setShowJson((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold mb-3">Agents / Threads</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: threads list */}
        <div className="border rounded-md p-2">
          <div className="text-sm font-medium">Threads</div>
          {threadsQ.isLoading && <div className="text-sm text-gray-500 mt-2">Loading…</div>}
          {threadsQ.error && <div className="text-sm text-red-600 mt-2" role="alert">{(threadsQ.error as Error).message}</div>}
          <ul className="mt-2 space-y-1">
            {threads.map((t) => (
              <li key={t.id}>
                <button
                  className={`w-full text-left px-2 py-1 rounded ${selectedThreadId === t.id ? 'bg-gray-200' : 'hover:bg-gray-100'}`}
                  onClick={() => {
                    setSelectedThreadId(t.id);
                    // reset internal loaders
                    initialLoadedRef.current = false;
                  }}
                >
                  <div className="text-sm">{t.alias}</div>
                  <div className="text-xs text-gray-500">created {new Date(t.createdAt).toLocaleString()}</div>
                </button>
              </li>
            ))}
            {threads.length === 0 && !threadsQ.isLoading && <li className="text-sm text-gray-500">No threads</li>}
          </ul>
        </div>

        {/* Right: unified messages across all runs */}
        <div className="md:col-span-1 border rounded-md p-2 min-h-[400px]">
          <div className="text-sm font-medium">Thread: {selectedThreadId || '(none selected)'}</div>
          <div className="mt-2 border rounded p-2 min-h-[300px]">
            <RunMessageList
              items={unifiedItems}
              showJson={showJson}
              onToggleJson={toggleJson}
              isLoading={runsQ.isLoading}
              error={loadError}
              hasMoreAbove={hasMoreAbove}
              loadingMoreAbove={loadingMore}
              onLoadMoreAbove={loadMoreAbove}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
