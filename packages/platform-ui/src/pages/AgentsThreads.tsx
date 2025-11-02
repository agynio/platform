import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3010';

type ThreadItem = { id: string; alias: string; createdAt: string };
type RunItem = { id: string; status: 'running' | 'finished' | 'terminated'; createdAt: string; updatedAt: string };
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

  const runsQ = useQuery({
    queryKey: ['agents', 'threads', selectedThreadId, 'runs'],
    enabled: !!selectedThreadId,
    queryFn: async () => api<{ items: RunItem[] }>(`agents/threads/${selectedThreadId}/runs`),
  });

  const inputQ = useQuery({
    queryKey: ['agents', 'runs', selectedRunId, 'messages', 'input'],
    enabled: !!selectedRunId,
    queryFn: async () => api<{ items: MessageItem[] }>(`agents/runs/${selectedRunId}/messages?type=input`),
  });
  const injectedQ = useQuery({
    queryKey: ['agents', 'runs', selectedRunId, 'messages', 'injected'],
    enabled: !!selectedRunId,
    queryFn: async () => api<{ items: MessageItem[] }>(`agents/runs/${selectedRunId}/messages?type=injected`),
  });
  const outputQ = useQuery({
    queryKey: ['agents', 'runs', selectedRunId, 'messages', 'output'],
    enabled: !!selectedRunId,
    queryFn: async () => api<{ items: MessageItem[] }>(`agents/runs/${selectedRunId}/messages?type=output`),
  });

  const threads = threadsQ.data?.items || [];
  const runs = runsQ.data?.items || [];
  const input = inputQ.data?.items || [];
  const injected = injectedQ.data?.items || [];
  const output = outputQ.data?.items || [];

  const [showJson, setShowJson] = useState<{ [id: string]: boolean }>({});
  const toggleJson = (id: string) => setShowJson((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold mb-3">Agents / Threads</h1>
      <div className="grid grid-cols-3 gap-4">
        {/* Left: threads list */}
        <div className="col-span-1 border rounded-md p-2">
          <div className="text-sm font-medium">Threads</div>
          <ul className="mt-2 space-y-1">
            {threads.map((t) => (
              <li key={t.id}>
                <button className={`w-full text-left px-2 py-1 rounded ${selectedThreadId === t.id ? 'bg-gray-200' : 'hover:bg-gray-100'}`} onClick={() => { setSelectedThreadId(t.id); setSelectedRunId(undefined); }}>
                  <div className="text-sm">{t.alias}</div>
                  <div className="text-xs text-gray-500">created {new Date(t.createdAt).toLocaleString()}</div>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Right: runs and messages */}
        <div className="col-span-2 border rounded-md p-2">
          <div className="text-sm font-medium">Thread: {selectedThreadId || '(none selected)'}</div>
          <div className="mt-2 grid grid-cols-3 gap-3">
            {/* Runs list */}
            <div className="col-span-1 border rounded p-2">
              <div className="text-sm font-medium">Runs</div>
              <ul className="mt-2 space-y-1">
                {runs.map((r) => (
                  <li key={r.id}>
                    <button className={`w-full text-left px-2 py-1 rounded ${selectedRunId === r.id ? 'bg-gray-200' : 'hover:bg-gray-100'}`} onClick={() => setSelectedRunId(r.id)}>
                      <div className="text-sm">{r.id.slice(0, 8)}… {r.status}</div>
                      <div className="text-xs text-gray-500">{new Date(r.createdAt).toLocaleString()}</div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Messages: Input / Injected / Output */}
            <div className="col-span-2 grid grid-cols-3 gap-3">
              {[{ label: 'Input', items: input }, { label: 'Injected', items: injected }, { label: 'Output', items: output }].map((col) => (
                <div key={col.label} className="border rounded p-2">
                  <div className="text-sm font-medium">{col.label}</div>
                  <ul className="mt-2 space-y-2">
                    {col.items.map((m) => (
                      <li key={m.id} className="border rounded p-2">
                        <div className="text-xs text-gray-500">{m.kind} • {new Date(m.createdAt).toLocaleTimeString()}</div>
                        {m.text ? <div className="text-sm mt-1">{m.text}</div> : <div className="text-xs text-gray-500">(no text)</div>}
                        <button className="mt-2 text-xs underline" onClick={() => toggleJson(m.id)}>{showJson[m.id] ? 'Hide raw JSON' : 'Show raw JSON'}</button>
                        {showJson[m.id] && (
                          <pre className="mt-2 text-xs bg-gray-50 p-2 rounded overflow-x-auto">{JSON.stringify(m.source, null, 2)}</pre>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
