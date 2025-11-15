import { http, asData } from '@/api/http';
import type { ThreadMetrics, ThreadNode, ThreadReminder } from '@/api/types/agents';

export const threads = {
  roots: (status: 'open' | 'closed' | 'all' = 'open', limit = 100) =>
    asData<{ items: ThreadNode[] }>(
      http.get<{ items: ThreadNode[] }>(`/api/agents/threads`, {
        params: { rootsOnly: true, status, limit, includeMetrics: true, includeAgentTitles: true },
      }),
    ),
  children: (id: string, status: 'open' | 'closed' | 'all' = 'open') =>
    asData<{ items: ThreadNode[] }>(
      http.get<{ items: ThreadNode[] }>(`/api/agents/threads/${encodeURIComponent(id)}/children`, {
        params: { status, includeMetrics: true, includeAgentTitles: true },
      }),
    ),
  patchStatus: (id: string, status: 'open' | 'closed') =>
    asData<void>(http.patch(`/api/agents/threads/${encodeURIComponent(id)}`, { status })),
  metrics: (id: string) =>
    asData<ThreadMetrics>(http.get(`/api/agents/threads/${encodeURIComponent(id)}/metrics`)),
  reminders: async (id: string, take: number = 200) => {
    const res = await asData<{ items: ThreadReminder[] }>(
      http.get(`/api/agents/reminders`, { params: { filter: 'active', take } }),
    );
    const items = (res.items || []).filter((r) => r.threadId === id);
    items.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    return { items };
  },
};
