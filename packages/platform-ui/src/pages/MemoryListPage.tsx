import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { memoryApi, type MemoryDocItem } from '@/api/modules/memory';
import { useNodeTitleMap } from '@/features/graph/hooks/useNodeTitleMap';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

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

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Node</TableHead>
              <TableHead>Scope</TableHead>
              <TableHead>Thread</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {docsQuery.isLoading ? (
              <TableRow>
                <TableCell colSpan={3}>Loading memory documents…</TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  No memory documents found.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{row.title}</span>
                      <span className="text-xs text-muted-foreground">{row.nodeId}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{row.scope === 'global' ? 'Global' : 'Per thread'}</Badge>
                  </TableCell>
                  <TableCell>{row.scope === 'perThread' ? row.threadId ?? '—' : '—'}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
