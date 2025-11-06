import { useMemo, useState, useCallback, Fragment } from 'react';
import { useQuery } from '@tanstack/react-query';
import { httpJson } from '@/api/client';
import { Table, Thead, Tbody, Tr, Th, Td, Button, Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, Input } from '@agyn/ui';
import { Link } from 'react-router-dom';
import { ClipboardCopy } from 'lucide-react';
import { notifyError, notifySuccess } from '@/lib/notify';

type ContainerItem = {
  containerId: string;
  threadId: string | null;
  role: string;
  image: string;
  status: 'running' | 'stopped' | 'terminating' | 'failed';
  startedAt: string;
  lastUsedAt: string;
  killAfterAt: string | null;
};

type SidecarItem = {
  containerId: string;
  parentContainerId: string;
  role: 'dind';
  image: string;
  status: 'running' | 'stopped';
  startedAt: string;
};

function isUuid(v: string): boolean {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(v);
}

function truncateId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    notifySuccess('Copied to clipboard');
  } catch (e) {
    notifyError('Failed to copy to clipboard');
  }
}

export function MonitoringContainers() {
  const status = 'running';
  const sortBy = 'lastUsedAt';
  const sortDir = 'desc';
  const [threadIdInput, setThreadIdInput] = useState<string>('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [sidecars, setSidecars] = useState<Record<string, SidecarItem[]>>({});

  const validThreadId = threadIdInput && isUuid(threadIdInput) ? threadIdInput : undefined;

  const queryKey = useMemo(() => ['containers', { status, sortBy, sortDir, threadId: validThreadId || null }], [status, sortBy, sortDir, validThreadId]);
  const listQ = useQuery<{ items: ContainerItem[] }, Error>({
    queryKey,
    queryFn: async () => {
      const baseUrl = `/api/containers?status=${status}&sortBy=${sortBy}&sortDir=${sortDir}`;
      const url = validThreadId ? `${baseUrl}&threadId=${encodeURIComponent(validThreadId)}` : baseUrl;
      const res = await httpJson<{ items: ContainerItem[] }>(url, undefined, '');
      return { items: res?.items ?? [] };
    },
    refetchInterval: 5000,
  });

  const items = listQ.data?.items || [];
  // Ensure client-side default sort by lastUsedAt desc
  const sorted = [...items].sort((a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime());

  const toggleExpand = useCallback((parentId: string) => {
    setExpanded((prev) => ({ ...prev, [parentId]: !prev[parentId] }));
  }, []);

  const useSidecarsQuery = (parentId: string, enabled: boolean) =>
    useQuery<{ items: SidecarItem[] }, Error>({
      queryKey: ['sidecars', parentId],
      enabled,
      staleTime: 5000,
      queryFn: async () => {
        const res = await httpJson<{ items: SidecarItem[] }>(`/api/containers/${encodeURIComponent(parentId)}/sidecars`, undefined, '');
        return { items: res?.items ?? [] };
      },
    });

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-xl font-semibold">Monitoring / Containers</h1>
        <Button onClick={() => listQ.refetch()} variant="outline" size="sm">Refresh</Button>
      </div>
      <div className="flex items-center gap-2 mb-3">
        <Input
          aria-label="Filter by threadId"
          placeholder="Filter by threadId (UUID)"
          value={threadIdInput}
          onChange={(e) => setThreadIdInput(e.currentTarget.value)}
          className="max-w-md"
        />
        {threadIdInput && (
          <Button variant="ghost" size="sm" onClick={() => setThreadIdInput('')}>Clear</Button>
        )}
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
                <Th />
                <Th>containerId</Th>
                <Th>threadId</Th>
                <Th>role</Th>
                <Th>image</Th>
                <Th>status</Th>
                <Th>startedAt</Th>
                <Th>lastUsedAt</Th>
                <Th>killAfterAt</Th>
              </Tr>
            </Thead>
            <Tbody>
              {sorted.map((c) => {
                const scQ = useSidecarsQuery(c.containerId, !!expanded[c.containerId]);
                const scItems = scQ.data?.items || [];
                return (
                <Fragment key={c.containerId}>
                <Tr>
                  <Td>
                    <Button aria-label={expanded[c.containerId] ? 'Collapse' : 'Expand'} variant="ghost" size="sm" onClick={() => toggleExpand(c.containerId)}>
                      {expanded[c.containerId] ? '−' : '+'}
                    </Button>
                  </Td>
                  <Td className="font-mono text-xs">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>{truncateId(c.containerId)}</span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs">{c.containerId}</span>
                            <Button aria-label="Copy containerId" variant="outline" size="sm" onClick={() => copyToClipboard(c.containerId)}>
                              <ClipboardCopy className="h-3 w-3" />
                            </Button>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </Td>
                  <Td className="font-mono text-xs">
                    {c.threadId ? (
                      <Link className="underline" to={`/tracing/thread/${c.threadId}`}>{c.threadId}</Link>
                    ) : (
                      <span className="text-muted-foreground">(none)</span>
                    )}
                  </Td>
                  <Td className="font-mono text-xs">{c.role || 'workspace'}</Td>
                  <Td className="font-mono text-xs">{c.image}</Td>
                  <Td>{c.status}</Td>
                  <Td>{new Date(c.startedAt).toLocaleString()}</Td>
                  <Td>{new Date(c.lastUsedAt).toLocaleString()}</Td>
                  <Td>{c.killAfterAt ? new Date(c.killAfterAt).toLocaleString() : '-'}</Td>
                </Tr>
                {expanded[c.containerId] && (
                  (scItems.length > 0) ? (
                    scItems.map((sc) => (
                      <Tr key={`sc-${sc.containerId}`}>
                        <Td />
                        <Td className="font-mono text-xs">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="pl-4">{truncateId(sc.containerId)}</span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs">{sc.containerId}</span>
                                  <Button aria-label="Copy sidecarId" variant="outline" size="sm" onClick={() => copyToClipboard(sc.containerId)}>
                                    <ClipboardCopy className="h-3 w-3" />
                                  </Button>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </Td>
                        <Td className="font-mono text-xs">{c.threadId || '-'}</Td>
                        <Td className="font-mono text-xs">{sc.role}</Td>
                        <Td className="font-mono text-xs">{sc.image}</Td>
                        <Td>{sc.status}</Td>
                        <Td>{new Date(sc.startedAt).toLocaleString()}</Td>
                        <Td>-</Td>
                        <Td>-</Td>
                      </Tr>
                    ))
                  ) : (
                    <Tr key={`${c.containerId}-none`}>
                      <Td />
                      <Td colSpan={8} className="text-muted-foreground pl-4">No sidecars.</Td>
                    </Tr>
                  )
                )}
                </Fragment>
              );})}
            </Tbody>
          </Table>
        </div>
      )}
    </div>
  );
}
