import { useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { type ThreadStatusFilter } from './ThreadStatusFilterSwitch';
import { ThreadTreeNode, type ThreadNode } from './ThreadTreeNode';
import { useThreadRoots } from '@/api/hooks/threads';

export function ThreadTree({ status, onSelect, selectedId }: { status: ThreadStatusFilter; onSelect: (id: string) => void; selectedId?: string }) {
  const qc = useQueryClient();
  const rootsQ = useThreadRoots(status) as UseQueryResult<{ items: ThreadNode[] }, Error>;

  const invalidate = () => qc.invalidateQueries({ queryKey: ['agents', 'threads', 'roots', status] });

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
