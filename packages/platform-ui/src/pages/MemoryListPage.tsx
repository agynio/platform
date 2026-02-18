import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { memoryApi, type MemoryDocItem } from '@/api/modules/memory';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/Badge';

type MemoryRow = {
  key: string;
  nodeId: string;
  scope: MemoryDocItem['scope'];
  threadId?: string;
};

export function MemoryListPage() {
  const docsQuery = useQuery({
    queryKey: ['memory', 'docs', 'list'],
    queryFn: () => memoryApi.listDocs(),
    staleTime: 30_000,
  });
  const rows = useMemo<MemoryRow[]>(() => {
    const items = docsQuery.data?.items ?? [];
    return items.map((item, index) => ({
      key: `${item.nodeId}-${item.scope}-${item.threadId ?? 'global'}-${index}`,
      nodeId: item.nodeId,
      scope: item.scope,
      threadId: item.threadId,
    }));
  }, [docsQuery.data]);

  const errorMessage = docsQuery.error
    ? docsQuery.error instanceof Error
      ? docsQuery.error.message
      : 'Unable to load memory documents.'
    : null;

  const handleRefresh = () => {
    void docsQuery.refetch();
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white">
      <div className="border-b border-[var(--agyn-border-subtle)] bg-white px-6 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-[var(--agyn-dark)]">Memory</h1>
            <p className="mt-1 text-sm text-[var(--agyn-text-subtle)]">Browse nodes with stored memory documents.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={docsQuery.isFetching}
              className="inline-flex items-center gap-2 rounded-md border border-[var(--agyn-border-subtle)] bg-white px-3 py-2 text-sm font-medium text-[var(--agyn-dark)] shadow-sm transition-colors hover:bg-[var(--agyn-bg-light)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Refresh
            </button>
            <Link
              to="/agents/memory"
              className="inline-flex items-center gap-2 rounded-md border border-[var(--agyn-border-subtle)] bg-white px-3 py-2 text-sm font-medium text-[var(--agyn-dark)] shadow-sm transition-colors hover:bg-[var(--agyn-bg-light)]"
            >
              Open memory manager
            </Link>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {errorMessage && (
          <div className="shrink-0 border-b border-[var(--agyn-border-subtle)] px-6 py-4">
            <Alert variant="destructive">
              <AlertDescription>Failed to load memory documents: {errorMessage}</AlertDescription>
            </Alert>
          </div>
        )}

        <div className="flex-1 overflow-auto">
          <table className="w-full table-fixed border-collapse">
            <colgroup>
              <col style={{ width: '45%' }} />
              <col style={{ width: '25%' }} />
              <col style={{ width: '30%' }} />
            </colgroup>
            <thead className="sticky top-0 z-10">
              <tr className="bg-white shadow-[0_1px_0_0_var(--agyn-border-subtle)]">
                <th className="px-6 py-3 text-left text-xs font-medium text-[var(--agyn-text-subtle)]">Node</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[var(--agyn-text-subtle)]">Scope</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[var(--agyn-text-subtle)]">Thread</th>
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
                    className="border-b border-[var(--agyn-border-subtle)] transition-colors hover:bg-[var(--agyn-bg-light)]/50"
                  >
                    <td className="h-[60px] px-6">
                      <div className="flex flex-col">
                        <span className="font-medium">{row.nodeId}</span>
                      </div>
                    </td>
                    <td className="h-[60px] px-6">
                      <Badge variant="outline">{row.scope === 'global' ? 'Global' : 'Per thread'}</Badge>
                    </td>
                    <td className="h-[60px] px-6">{row.scope === 'perThread' ? row.threadId ?? '—' : '—'}</td>
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
