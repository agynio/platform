import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { memoryApi, type MemoryDocItem } from '@/api/modules/memory';
import { useNodeTitleMap } from '@/features/graph/hooks/useNodeTitleMap';
import { Button } from '@/components/Button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/Badge';

type MemoryRow = {
  key: string;
  nodeId: string;
  title: string;
  scope: MemoryDocItem['scope'];
  threadId?: string;
};

export function MemoryListPage() {
  const docsQuery = useQuery({
    queryKey: ['memory', 'docs', 'list'],
    queryFn: () => memoryApi.listDocs(),
    staleTime: 30_000,
  });
  const { titleMap } = useNodeTitleMap();

  const rows = useMemo<MemoryRow[]>(() => {
    const items = docsQuery.data?.items ?? [];
    return items.map((item, index) => ({
      key: `${item.nodeId}-${item.scope}-${item.threadId ?? 'global'}-${index}`,
      nodeId: item.nodeId,
      title: titleMap.get(item.nodeId) ?? item.nodeId,
      scope: item.scope,
      threadId: item.threadId,
    }));
  }, [docsQuery.data, titleMap]);

  const errorMessage = docsQuery.error
    ? docsQuery.error instanceof Error
      ? docsQuery.error.message
      : 'Unable to load memory documents.'
    : null;

  const handleRefresh = () => {
    void docsQuery.refetch();
  };

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="space-y-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Memory</h1>
          <p className="text-sm text-muted-foreground">Browse nodes with stored memory documents.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={handleRefresh} disabled={docsQuery.isFetching}>
            Refresh
          </Button>
          <Button asChild>
            <Link to="/agents/memory">Open memory manager</Link>
          </Button>
        </div>
      </div>

      {errorMessage && (
        <Alert variant="destructive">
          <AlertDescription>Failed to load memory documents: {errorMessage}</AlertDescription>
        </Alert>
      )}

      <div className="rounded-lg border bg-white">
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse table-fixed">
            <colgroup>
              <col style={{ width: '45%' }} />
              <col style={{ width: '25%' }} />
              <col style={{ width: '30%' }} />
            </colgroup>
            <thead className="sticky top-0 z-10">
              <tr className="bg-white shadow-[0_1px_0_0_var(--agyn-border-subtle)]">
                <th className="text-left px-6 py-3 text-xs font-medium text-[var(--agyn-text-subtle)]">Node</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-[var(--agyn-text-subtle)]">Scope</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-[var(--agyn-text-subtle)]">Thread</th>
              </tr>
            </thead>
            <tbody>
              {docsQuery.isLoading ? (
                <tr>
                  <td colSpan={3} className="px-6 py-12 text-center text-sm text-[var(--agyn-text-subtle)]">
                    Loading memory documents…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-6 py-12 text-center text-sm text-[var(--agyn-text-subtle)]">
                    No memory documents found.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.key}
                    className="border-b border-[var(--agyn-border-subtle)] hover:bg-[var(--agyn-bg-light)]/50 transition-colors"
                  >
                    <td className="px-6 h-[60px]">
                      <div className="flex flex-col">
                        <span className="font-medium">{row.title}</span>
                        <span className="text-xs text-[var(--agyn-text-subtle)]">{row.nodeId}</span>
                      </div>
                    </td>
                    <td className="px-6 h-[60px]">
                      <Badge variant="outline">{row.scope === 'global' ? 'Global' : 'Per thread'}</Badge>
                    </td>
                    <td className="px-6 h-[60px]">{row.scope === 'perThread' ? row.threadId ?? '—' : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
