import { useEffect } from 'react';
import { useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { type ThreadStatusFilter } from './ThreadStatusFilterSwitch';
import { ThreadTreeNode, type ThreadNode } from './ThreadTreeNode';
import { useThreadRoots } from '@/api/hooks/threads';
import { graphSocket } from '@/lib/graph/socket';

export function ThreadTree({ status, onSelect, selectedId }: { status: ThreadStatusFilter; onSelect: (id: string) => void; selectedId?: string }) {
  const qc = useQueryClient();
  const rootsQ = useThreadRoots(status) as UseQueryResult<{ items: ThreadNode[] }, Error>;

  const invalidate = () => qc.invalidateQueries({ queryKey: ['agents', 'threads', 'roots', status] });
  // Subscribe to threads room and update react-query cache on events
  useEffect(() => {
    graphSocket.subscribe(['threads']);
    const offAct = graphSocket.onThreadActivityChanged((payload) => {
      qc.setQueryData<{ items: ThreadNode[] }>(['agents', 'threads', 'roots', status], (prev) => {
        if (!prev) return prev;
        const items = prev.items.map((t) => (t.id === payload.threadId ? { ...t, metrics: { ...(t.metrics || { remindersCount: 0, activity: 'idle' }), activity: payload.activity } } : t));
        return { items };
      });
    });
    const offRem = graphSocket.onThreadRemindersCount((payload) => {
      qc.setQueryData<{ items: ThreadNode[] }>(['agents', 'threads', 'roots', status], (prev) => {
        if (!prev) return prev;
        const items = prev.items.map((t) => (t.id === payload.threadId ? { ...t, metrics: { ...(t.metrics || { remindersCount: 0, activity: 'idle' }), remindersCount: payload.remindersCount } } : t));
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
        const node: ThreadNode = { id: thread.id, alias: thread.alias, summary: thread.summary, status: thread.status, parentId: thread.parentId, createdAt: thread.createdAt, metrics: { remindersCount: 0, activity: 'idle' } };
        const existing = prev?.items?.some((t) => t.id === node.id);
        const items = existing ? prev!.items : prev ? [node, ...prev.items] : [node];
        return { items };
      });
    });
    return () => { offAct(); offRem(); offCreated(); };
  }, [qc, status]);

  return (
    <div>
      {rootsQ.isLoading && <div className="text-sm text-gray-500 mt-2">Loading…</div>}
      {rootsQ.error && (
        <div className="text-sm text-red-600 mt-2" role="alert">{rootsQ.error.message}</div>
      )}
      <ul role="tree" className="mt-2 space-y-1">
        {(rootsQ.data?.items || []).map((t) => (
          <ThreadTreeNode key={t.id} node={t} statusFilter={status} level={0} onSelect={onSelect} selectedId={selectedId} invalidateSiblingCache={invalidate} />
        ))}
        {rootsQ.data?.items?.length === 0 && !rootsQ.isLoading && (
          <li className="text-sm text-gray-500">No threads</li>
        )}
      </ul>
    </div>
  );
}
