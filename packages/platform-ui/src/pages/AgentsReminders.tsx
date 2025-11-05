import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3010';

type ReminderItem = { id: string; threadId: string; note: string; at: string; createdAt: string; completedAt: string | null };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${API_BASE}/api/${path}`, { headers: { 'Content-Type': 'application/json' }, ...(init || {}) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

export function AgentsReminders() {
  const [sp, setSp] = useSearchParams();
  const filter = (sp.get('filter') as 'active' | 'completed' | 'all' | null) || 'active';

  const remindersQ = useQuery({
    queryKey: ['agents', 'reminders', filter],
    queryFn: async () => api<{ items: ReminderItem[] }>(`agents/reminders?filter=${filter}`),
    retry: false,
  });

  const items = useMemo(() => {
    const list = remindersQ.data?.items ?? [];
    // Ensure sorted by at desc (server enforces, keep client-side for safety)
    return [...list].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [remindersQ.data]);

  function setFilter(next: 'active' | 'completed' | 'all') {
    const nextSp = new URLSearchParams(sp);
    nextSp.set('filter', next);
    setSp(nextSp, { replace: false });
  }

  return (
    <div className="absolute inset-0 flex min-h-0 min-w-0 flex-col overflow-hidden">
      {/* Header bar */}
      <div className="shrink-0 border-b px-4 py-3">
        <h1 className="text-xl font-semibold">Agents / Reminders</h1>
      </div>

      {/* Content area */}
      <div className="flex-1 min-h-0 p-4">
        <div className="h-full min-h-0 overflow-y-auto">
          <div className="flex h-full min-h-0 flex-col gap-4">
            {/* Filters */}
            <div className="flex items-center gap-2">
              <span className="text-sm">Filter:</span>
              <button
                type="button"
                className={`px-2 py-1 rounded text-sm ${filter === 'active' ? 'bg-gray-200' : 'hover:bg-gray-100'}`}
                onClick={() => setFilter('active')}
                aria-pressed={filter === 'active'}
              >
                Active
              </button>
              <button
                type="button"
                className={`px-2 py-1 rounded text-sm ${filter === 'all' ? 'bg-gray-200' : 'hover:bg-gray-100'}`}
                onClick={() => setFilter('all')}
                aria-pressed={filter === 'all'}
              >
                All
              </button>
              <button
                type="button"
                className={`px-2 py-1 rounded text-sm ${filter === 'completed' ? 'bg-gray-200' : 'hover:bg-gray-100'}`}
                onClick={() => setFilter('completed')}
                aria-pressed={filter === 'completed'}
              >
                Completed
              </button>
            </div>

            {/* Table */}
            <div className="flex-1 min-h-0">
              {remindersQ.isLoading && <div className="text-sm text-gray-500 mt-2">Loading…</div>}
              {remindersQ.error && (
                <div className="text-sm text-red-600 mt-2" role="alert">{(remindersQ.error as Error).message}</div>
              )}
              {!remindersQ.isLoading && !remindersQ.error && items.length === 0 && (
                <div className="text-sm text-gray-500 mt-2">No reminders</div>
              )}
              {items.length > 0 && (
                <div className="overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left border-b">
                        <th className="px-2 py-2">ThreadId</th>
                        <th className="px-2 py-2">Note</th>
                        <th className="px-2 py-2">Scheduled At</th>
                        <th className="px-2 py-2">Completed At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((r) => (
                        <tr key={r.id} className="border-b">
                          <td className="px-2 py-2">
                            <a href={`/tracing/thread/${r.threadId}`} className="underline">
                              {r.threadId}
                            </a>
                          </td>
                          <td className="px-2 py-2">{r.note}</td>
                          <td className="px-2 py-2">{new Date(r.at).toLocaleString()}</td>
                          <td className="px-2 py-2">{r.completedAt ? new Date(r.completedAt).toLocaleString() : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
