import { http, asData } from '@/api/http';
import type { ThreadNode } from '@/api/types/agents';

export const threads = {
  roots: (status: 'open' | 'closed' | 'all' = 'open', limit = 100) =>
    asData<{ items: ThreadNode[] }>(
      http.get<{ items: ThreadNode[] }>(`/api/agents/threads`, { params: { rootsOnly: true, status, limit, includeMetrics: true } }),
    ),
  children: (id: string, status: 'open' | 'closed' | 'all' = 'open') =>
    asData<{ items: ThreadNode[] }>(
      http.get<{ items: ThreadNode[] }>(`/api/agents/threads/${encodeURIComponent(id)}/children`, { params: { status, includeMetrics: true } }),
    ),
  patchStatus: (id: string, status: 'open' | 'closed') =>
    asData<void>(http.patch(`/api/agents/threads/${encodeURIComponent(id)}`, { status })),
};
