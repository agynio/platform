import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { httpJson } from '@/lib/apiClient';
import { Table, Thead, Tbody, Tr, Th, Td, Button } from '@agyn/ui';
import { Link } from 'react-router-dom';

type ContainerItem = {
  containerId: string;
  threadId: string | null;
  image: string;
  status: 'running' | 'stopped' | 'terminating' | 'failed';
  startedAt: string;
  lastUsedAt: string;
  killAfterAt: string | null;
};

export function MonitoringContainers() {
  const status = 'running';
  const sortBy = 'lastUsedAt';
  const sortDir = 'desc';

  const queryKey = useMemo(() => ['containers', { status, sortBy, sortDir }], [status, sortBy, sortDir]);
  const listQ = useQuery<{ items: ContainerItem[] }, Error>({
    queryKey,
    queryFn: async () => {
      const res = await httpJson<{ items: ContainerItem[] }>(`/api/containers?status=${status}&sortBy=${sortBy}&sortDir=${sortDir}`);
      return { items: res?.items ?? [] };
    },
    refetchInterval: 5000,
  });

  const items = listQ.data?.items || [];
  // Ensure client-side default sort by lastUsedAt desc
  const sorted = [...items].sort((a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime());

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-xl font-semibold">Monitoring / Containers</h1>
        <Button onClick={() => listQ.refetch()} variant="outline" size="sm">Refresh</Button>
      </div>
      {listQ.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {listQ.error && (
        <div className="text-sm text-red-600" role="alert">{String(listQ.error.message || 'Error')}</div>
      )}
      {!listQ.isLoading && !listQ.error && sorted.length === 0 && (
        <div className="text-sm text-muted-foreground">No containers.</div>
      )}
      {sorted.length > 0 && (
        <div className="border rounded-md overflow-hidden">
          <Table>
            <Thead>
              <Tr>
                <Th>containerId</Th>
                <Th>threadId</Th>
                <Th>image</Th>
                <Th>status</Th>
                <Th>startedAt</Th>
                <Th>lastUsedAt</Th>
                <Th>killAfterAt</Th>
              </Tr>
            </Thead>
            <Tbody>
              {sorted.map((c) => (
                <Tr key={c.containerId}>
                  <Td className="font-mono text-xs">{c.containerId}</Td>
                  <Td className="font-mono text-xs">
                    {c.threadId ? (
                      <Link className="underline" to={`/tracing/thread/${c.threadId}`}>{c.threadId}</Link>
                    ) : (
                      <span className="text-muted-foreground">(none)</span>
                    )}
                  </Td>
                  <Td className="font-mono text-xs">{c.image}</Td>
                  <Td>{c.status}</Td>
                  <Td>{new Date(c.startedAt).toLocaleString()}</Td>
                  <Td>{new Date(c.lastUsedAt).toLocaleString()}</Td>
                  <Td>{c.killAfterAt ? new Date(c.killAfterAt).toLocaleString() : '-'}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      )}
    </div>
  );
}
