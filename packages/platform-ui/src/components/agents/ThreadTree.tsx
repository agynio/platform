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
  onSelectedNodeChange,
}: {
  status: ThreadStatusFilter;
  onSelect: (node: ThreadNode) => void;
  selectedId?: string;
  onSelectedNodeChange?: (node: ThreadNode) => void;
}) {
  const qc = useQueryClient();
  const rootsQ = useThreadRoots(status) as UseQueryResult<{ items: ThreadNode[] }, Error>;

  const invalidate = () => qc.invalidateQueries({ queryKey: ['agents', 'threads', 'roots', status] });
  // Subscribe to threads room and update react-query cache on events
  useEffect(() => {
    graphSocket.subscribe(['threads']);
    const defaultMetrics: ThreadMetrics = { remindersCount: 0, containersCount: 0, activity: 'idle', runsCount: 0 };
    const offAct = graphSocket.onThreadActivityChanged((payload) => {
      qc.setQueryData<{ items: ThreadNode[] }>(['agents', 'threads', 'roots', status], (prev) => {
        if (!prev) return prev;
        const items = prev.items.map((t) =>
          t.id === payload.threadId ? { ...t, metrics: { ...(t.metrics ?? defaultMetrics), activity: payload.activity } } : t,
        );
        return { items };
      });
    });
    const offRem = graphSocket.onThreadRemindersCount((payload) => {
      qc.setQueryData<{ items: ThreadNode[] }>(['agents', 'threads', 'roots', status], (prev) => {
        if (!prev) return prev;
        const items = prev.items.map((t) =>
          t.id === payload.threadId
            ? { ...t, metrics: { ...(t.metrics ?? defaultMetrics), remindersCount: payload.remindersCount } }
            : t,
        );
        return { items };
      });
    });
    const offCreated = graphSocket.onThreadCreated((payload) => {
      const thread = payload.thread;
      // Only add to roots list if thread is a root and matches current filter
      const matchesFilter = status === 'all' || thread.status === status;
      const isRoot = thread.parentId == null;
      if (!matchesFilter || !isRoot) return;
      qc.setQueryData<{ items: ThreadNode[] }>(['agents', 'threads', 'roots', status], (prev) => {
        const node: ThreadNode = {
          id: thread.id,
          alias: thread.alias,
          summary: thread.summary,
          status: thread.status,
          parentId: thread.parentId,
          createdAt: thread.createdAt,
          metrics: { remindersCount: 0, containersCount: 0, activity: 'idle', runsCount: 0 },
          agentName: '(unknown agent)',
        };
        const existing = prev?.items?.some((t) => t.id === node.id);
        const items = existing ? prev!.items : prev ? [node, ...prev.items] : [node];
        return { items };
      });
    });
    const offUpdated = graphSocket.onThreadUpdated((payload) => {
      qc.setQueryData<{ items: ThreadNode[] }>(['agents', 'threads', 'roots', status], (prev) => {
        if (!prev) return prev;
        const items = prev.items.map((t) =>
          t.id === payload.thread.id
            ? {
                ...t,
                summary: payload.thread.summary,
                status: payload.thread.status,
                createdAt: payload.thread.createdAt,
              }
            : t,
        );
        return { items };
      });
    });
    return () => { offAct(); offRem(); offCreated(); offUpdated(); };
  }, [qc, status]);

  return (
    <div>
      {rootsQ.isLoading && <div className="mt-2 text-sm text-muted-foreground">Loading…</div>}
      {rootsQ.error && (
        <div className="mt-2 text-sm text-destructive" role="alert">{rootsQ.error.message}</div>
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
            onSelectedNodeChange={onSelectedNodeChange}
          />
        ))}
        {rootsQ.data?.items?.length === 0 && !rootsQ.isLoading && (
          <li className="text-sm text-muted-foreground">No threads</li>
        )}
      </ul>
    </div>
  );
}
