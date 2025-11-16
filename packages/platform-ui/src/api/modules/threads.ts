import { http, asData } from '@/api/http';
import type { ThreadNode } from '@/api/types/agents';

const threadLookupCache = new Map<string, { id: string; alias: string }>();

function rememberThread(node: ThreadNode) {
  threadLookupCache.set(node.id, { id: node.id, alias: node.alias });
  threadLookupCache.set(node.alias, { id: node.id, alias: node.alias });
}

async function fetchThreads(params: Record<string, unknown>) {
  const res = await asData<{ items: ThreadNode[] }>(http.get<{ items: ThreadNode[] }>(`/api/agents/threads`, { params }));
  res.items.forEach(rememberThread);
  return res;
}

export const threads = {
  roots: (status: 'open' | 'closed' | 'all' = 'open', limit = 100) =>
    fetchThreads({ rootsOnly: true, status, limit, includeMetrics: true, includeAgentTitles: true }),
  children: (id: string, status: 'open' | 'closed' | 'all' = 'open') =>
    asData<{ items: ThreadNode[] }>(
      http.get<{ items: ThreadNode[] }>(`/api/agents/threads/${encodeURIComponent(id)}/children`, {
        params: { status, includeMetrics: true, includeAgentTitles: true },
      }),
    ).then((res) => {
      res.items.forEach(rememberThread);
      return res;
    }),
  patchStatus: (id: string, status: 'open' | 'closed') =>
    asData<void>(http.patch(`/api/agents/threads/${encodeURIComponent(id)}`, { status })),
  resolveIdentifier: async (identifier: string): Promise<{ id: string; alias: string } | null> => {
    if (!identifier) return null;
    const cached = threadLookupCache.get(identifier);
    if (cached) return cached;
    const res = await fetchThreads({ status: 'all', limit: 500 });
    const found = res.items.find((thread) => thread.id === identifier || thread.alias === identifier);
    if (!found) return null;
    rememberThread(found);
    return { id: found.id, alias: found.alias };
  },
};
