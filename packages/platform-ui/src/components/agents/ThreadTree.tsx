import { useEffect } from 'react';
import { useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { type ThreadStatusFilter } from './ThreadStatusFilterSwitch';
import { ThreadTreeNode } from './ThreadTreeNode';
import { useThreadRoots } from '@/api/hooks/threads';
import { graphSocket } from '@/lib/graph/socket';
import type { ThreadMetrics, ThreadNode } from '@/api/types/agents';

export function ThreadTree({
  status,
  onSelect,
  selectedId,
}: {
  status: ThreadStatusFilter;
  onSelect: (thread: { id: string; alias: string }) => void;
  selectedId?: string;
}) {
  const qc = useQueryClient();
  const rootsQ = useThreadRoots(status) as UseQueryResult<{ items: ThreadNode[] }, Error>;

  const invalidate = () => qc.invalidateQueries({ queryKey: ['agents', 'threads', 'roots', status] });
  useEffect(() => {
    graphSocket.subscribe(['threads']);
    return () => {
      graphSocket.unsubscribe(['threads']);
    };
  }, []);

  // Subscribe to threads room events and update react-query cache on events
  useEffect(() => {
    const queryKey = ['agents', 'threads', 'roots', status] as const;
    const defaultMetrics: ThreadMetrics = { remindersCount: 0, activity: 'idle', runsCount: 0 };

    const updateThread = (updater: (prev: ThreadNode[]) => ThreadNode[]) => {
      qc.setQueryData<{ items: ThreadNode[] }>(queryKey, (prev) => {
        if (!prev) return prev;
        const next = updater(prev.items);
        if (next === prev.items) return prev;
        return { items: next };
      });
    };

    const offAct = graphSocket.onThreadActivityChanged((payload) => {
      updateThread((items) =>
        items.map((t) =>
          t.id === payload.threadId ? { ...t, metrics: { ...(t.metrics ?? defaultMetrics), activity: payload.activity } } : t,
        ),
      );
    });

    const offRem = graphSocket.onThreadRemindersCount((payload) => {
      updateThread((items) =>
        items.map((t) =>
          t.id === payload.threadId
            ? { ...t, metrics: { ...(t.metrics ?? defaultMetrics), remindersCount: payload.remindersCount } }
            : t,
        ),
      );
    });

    type ThreadSummaryLike = {
      id: string;
      alias: string;
      summary: string | null;
      status: 'open' | 'closed';
      parentId?: string | null;
      createdAt: string;
    };

    const insertNode = (thread: ThreadSummaryLike): ThreadNode => ({
      id: thread.id,
      alias: thread.alias,
      summary: thread.summary,
      status: thread.status,
      parentId: thread.parentId,
      createdAt: thread.createdAt,
      metrics: { remindersCount: 0, activity: 'idle', runsCount: 0 },
      agentTitle: '(unknown agent)',
    });

    const matchesFilter = (thread: ThreadSummaryLike) => {
      if (status === 'all') return true;
      return thread.status === status;
    };

    const offCreated = graphSocket.onThreadCreated(({ thread }) => {
      const isRoot = thread.parentId == null;
      if (!isRoot || !matchesFilter(thread)) return;
      qc.setQueryData<{ items: ThreadNode[] }>(queryKey, (prev) => {
        const node = insertNode(thread);
        if (!prev) return { items: [node] };
        const exists = prev.items.some((t) => t.id === node.id);
        if (exists) return prev;
        return { items: [node, ...prev.items] };
      });
    });

    const offUpdated = graphSocket.onThreadUpdated(({ thread }) => {
      const isRoot = thread.parentId == null;
      const allow = isRoot && matchesFilter(thread);
      qc.setQueryData<{ items: ThreadNode[] }>(queryKey, (prev) => {
        if (!prev) return prev;
        const idx = prev.items.findIndex((item) => item.id === thread.id);
        // Remove if it no longer matches filter/root and exists
        if (!allow) {
          if (idx === -1) return prev;
          const nextItems = prev.items.filter((item) => item.id !== thread.id);
          return { items: nextItems };
        }
        if (idx === -1) {
          const node = insertNode(thread);
          return { items: [node, ...prev.items] };
        }
        const existing = prev.items[idx];
        const nextNode: ThreadNode = {
          ...existing,
          alias: thread.alias,
          summary: thread.summary,
          status: thread.status,
          createdAt: thread.createdAt,
          parentId: thread.parentId,
        };
        if (
          existing.alias === nextNode.alias &&
          existing.summary === nextNode.summary &&
          existing.status === nextNode.status &&
          existing.createdAt === nextNode.createdAt &&
          existing.parentId === nextNode.parentId
        ) {
          return prev;
        }
        const nextItems = [...prev.items];
        nextItems[idx] = nextNode;
        return { items: nextItems };
      });
    });

    return () => {
      offAct();
      offRem();
      offCreated();
      offUpdated();
    };
  }, [qc, status]);

  return (
    <div>
      {rootsQ.isLoading && <div className="text-sm text-gray-500 mt-2">Loading…</div>}
      {rootsQ.error && (
        <div className="text-sm text-red-600 mt-2" role="alert">{rootsQ.error.message}</div>
      )}
      <ul role="tree" className="mt-2 space-y-1">
        {(rootsQ.data?.items || []).map((t) => (
          <ThreadTreeNode
            key={t.id}
            node={t}
            statusFilter={status}
            level={0}
            onSelect={onSelect}
            selectedId={selectedId}
            invalidateSiblingCache={invalidate}
          />
        ))}
        {rootsQ.data?.items?.length === 0 && !rootsQ.isLoading && (
          <li className="text-sm text-gray-500">No threads</li>
        )}
      </ul>
    </div>
  );
}
