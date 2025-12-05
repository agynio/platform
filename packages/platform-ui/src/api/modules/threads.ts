import { http, asData } from '@/api/http';
import type { ThreadMetrics, ThreadNode, ThreadReminder } from '@/api/types/agents';

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const clampTake = (value: number | undefined, fallback = 200) => {
  if (!Number.isFinite(value)) return fallback;
  const coerced = Math.trunc(value as number);
  return Math.min(1000, Math.max(1, coerced));
};

export type ThreadTreeItem = ThreadNode & {
  children?: ThreadTreeItem[];
  hasChildren?: boolean;
};

export const threads = {
  roots: (status: 'open' | 'closed' | 'all' = 'open', limit = 100) =>
    asData<{ items: ThreadNode[] }>(
      http.get<{ items: ThreadNode[] }>(`/api/agents/threads`, {
        params: { rootsOnly: true, status, limit, includeMetrics: true, includeAgentTitles: true },
      }),
    ),
  treeRoots: (status: 'open' | 'closed' | 'all' = 'open', limit = 100, depth = 2) =>
    asData<{ items: ThreadTreeItem[] }>(
      http.get<{ items: ThreadTreeItem[] }>(`/api/agents/threads/tree`, {
        params: {
          status,
          limit,
          depth,
          includeMetrics: true,
          includeAgentTitles: true,
          childrenStatus: status,
        },
      }),
    ),
  children: (id: string, status: 'open' | 'closed' | 'all' = 'open') =>
    asData<{ items: ThreadNode[] }>(
      http.get<{ items: ThreadNode[] }>(`/api/agents/threads/${encodeURIComponent(id)}/children`, {
        params: { status, includeMetrics: true, includeAgentTitles: true },
      }),
    ),
  getById: (id: string) =>
    asData<ThreadNode>(
      http.get(`/api/agents/threads/${encodeURIComponent(id)}`, {
        params: { includeMetrics: true, includeAgentTitles: true },
      }),
    ),
  patchStatus: (id: string, status: 'open' | 'closed') =>
    asData<void>(http.patch(`/api/agents/threads/${encodeURIComponent(id)}`, { status })),
  create: ({ agentNodeId, text, parentId, alias }: { agentNodeId: string; text: string; parentId?: string; alias?: string }) => {
    const payload: Record<string, string> = { agentNodeId, text };
    if (parentId !== undefined) payload.parentId = parentId;
    if (alias !== undefined) payload.alias = alias;
    return asData<{ id: string }>(http.post(`/api/agents/threads`, payload));
  },
  sendMessage: (id: string, text: string) =>
    asData<{ ok: true }>(http.post(`/api/agents/threads/${encodeURIComponent(id)}/messages`, { text })),
  metrics: (id: string) =>
    asData<ThreadMetrics>(http.get(`/api/agents/threads/${encodeURIComponent(id)}/metrics`)),
  reminders: async (id: string, take: number = 200) => {
    if (!UUID_REGEX.test(id)) {
      throw new Error('Invalid thread identifier');
    }
    const limit = clampTake(take);
    const res = await asData<{ items: ThreadReminder[] }>(
      http.get(`/api/agents/reminders`, { params: { filter: 'active', take: limit, threadId: id } }),
    );
    const items = [...(res.items || [])];
    items.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    return { items };
  },
};
