import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { memoryApi } from '@/api/modules/memory';

type NodeSummary = {
  nodeId: string;
  scope: 'global' | 'perThread';
  threadCount: number;
};

export function MemoryNodesListPage() {
  const docsQuery = useQuery({
    queryKey: ['memory/docs'],
    queryFn: () => memoryApi.listDocs(),
    staleTime: 30_000,
  });

  const summaries = useMemo<NodeSummary[]>(() => {
    const items = docsQuery.data?.items ?? [];
    const map = new Map<string, { scope: 'global' | 'perThread'; threads: Set<string> }>();
    for (const item of items) {
      const existing = map.get(item.nodeId) ?? { scope: item.scope, threads: new Set<string>() };
      if (item.scope === 'perThread') {
        existing.scope = 'perThread';
        if (item.threadId) existing.threads.add(item.threadId);
      } else if (!map.has(item.nodeId)) {
        existing.scope = 'global';
      }
      map.set(item.nodeId, existing);
    }
    return Array.from(map.entries())
      .map(([nodeId, info]) => ({ nodeId, scope: info.scope, threadCount: info.threads.size }))
      .sort((a, b) => a.nodeId.localeCompare(b.nodeId));
  }, [docsQuery.data]);

  return (
    <div className="absolute inset-0 flex min-h-0 flex-col overflow-hidden">
      <div className="shrink-0 border-b px-4 py-3">
        <h1 className="text-xl font-semibold">Memory / Nodes</h1>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {docsQuery.isLoading ? (
          <div className="text-sm text-muted-foreground">Loading nodes…</div>
        ) : docsQuery.error ? (
          <div className="text-sm text-red-600" role="alert">
            {(docsQuery.error as Error).message || 'Failed to load memory nodes'}
          </div>
        ) : summaries.length === 0 ? (
          <div className="text-sm text-muted-foreground">No memory nodes found.</div>
        ) : (
          <div className="grid gap-3">
            {summaries.map((node) => (
              <Link
                key={node.nodeId}
                to={`/memory/${encodeURIComponent(node.nodeId)}`}
                className="flex flex-col gap-2 rounded border p-3 transition hover:border-primary"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{node.nodeId}</span>
                  <span
                    className={`rounded px-2 py-0.5 text-xs uppercase ${
                      node.scope === 'perThread'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {node.scope}
                  </span>
                </div>
                {node.scope === 'perThread' ? (
                  <span className="text-xs text-muted-foreground">
                    {node.threadCount} thread{node.threadCount === 1 ? '' : 's'} available
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Global scope memory</span>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
