import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RunList, type RunItem } from '@/components/agents/RunList';
import { RunMessageList, type UnifiedRunMessage } from '@/components/agents/RunMessageList';

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
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>(undefined);

  const threadsQ = useQuery({
    queryKey: ['agents', 'threads'],
    queryFn: async () => api<{ items: ThreadItem[] }>(`agents/threads`),
  });

  const runsQ = useQuery<{ items: RunItem[] }, Error>({
    queryKey: ['agents', 'threads', selectedThreadId, 'runs'],
    enabled: !!selectedThreadId,
    queryFn: async () => api<{ items: RunItem[] }>(`agents/threads/${selectedThreadId}/runs`),
  });

  const inputQ = useQuery<{ items: MessageItem[] }, Error>({
    queryKey: ['agents', 'runs', selectedRunId, 'messages', 'input'],
    enabled: !!selectedRunId,
    queryFn: async () => api<{ items: MessageItem[] }>(`agents/runs/${selectedRunId}/messages?type=input`),
  });
  const injectedQ = useQuery<{ items: MessageItem[] }, Error>({
    queryKey: ['agents', 'runs', selectedRunId, 'messages', 'injected'],
    enabled: !!selectedRunId,
    queryFn: async () => api<{ items: MessageItem[] }>(`agents/runs/${selectedRunId}/messages?type=injected`),
  });
  const outputQ = useQuery<{ items: MessageItem[] }, Error>({
    queryKey: ['agents', 'runs', selectedRunId, 'messages', 'output'],
    enabled: !!selectedRunId,
    queryFn: async () => api<{ items: MessageItem[] }>(`agents/runs/${selectedRunId}/messages?type=output`),
  });

  const threads = threadsQ.data?.items || [];
  const runs: RunItem[] = runsQ.data?.items ?? [];
  const input = inputQ.data?.items || [];
  const injected = injectedQ.data?.items || [];
  const output = outputQ.data?.items || [];

  const [showJson, setShowJson] = useState<{ [id: string]: boolean }>({});
  const toggleJson = (id: string) => setShowJson((prev) => ({ ...prev, [id]: !prev[id] }));

  const unified: UnifiedRunMessage[] = useMemo(() => {
    const mark = (items: MessageItem[], side: 'left' | 'right'): UnifiedRunMessage[] =>
      items.map((m) => ({ id: m.id, role: m.kind, text: m.text, source: m.source, createdAt: m.createdAt, side }));
    const merged = [...mark(input, 'left'), ...mark(injected, 'left'), ...mark(output, 'right')];
    merged.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return merged;
  }, [input, injected, output]);

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold mb-3">Agents / Threads</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                    setSelectedRunId(undefined);
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

        {/* Right: runs and unified chat messages */}
        <div className="md:col-span-2 border rounded-md p-2 min-h-[400px]">
          <div className="text-sm font-medium">Thread: {selectedThreadId || '(none selected)'}</div>
          <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Runs list */}
            <div className="border rounded p-2 md:col-span-1">
              <RunList runs={runs} selectedRunId={selectedRunId} onSelect={setSelectedRunId} />
            </div>

            {/* Unified message list */}
            <div className="border rounded p-2 md:col-span-2 min-h-[300px]">
              <RunMessageList
                items={unified}
                showJson={showJson}
                onToggleJson={toggleJson}
                isLoading={inputQ.isLoading || injectedQ.isLoading || outputQ.isLoading}
                error={inputQ.error || injectedQ.error || outputQ.error || null}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
