import React from 'react';
import { useContainers } from '@/api/hooks/containers';
import { Table, Thead, Tbody, Tr, Th, Td, Button, Input, Tooltip, TooltipTrigger, TooltipContent } from '@agyn/ui';
import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { validate as validateUuid } from 'uuid';

export function MonitoringContainers() {
  const status = 'running';
  const sortBy = 'lastUsedAt';
  const sortDir = 'desc';

  const [threadFilter, setThreadFilter] = useState('');
  const [debouncedThreadId, setDebouncedThreadId] = useState<string | undefined>(undefined);

  // Debounce thread filter input and only pass valid UUID to query
  useEffect(() => {
    const h = setTimeout(() => {
      const v = threadFilter.trim();
      setDebouncedThreadId(validateUuid(v) ? v : undefined);
    }, 300);
    return () => clearTimeout(h);
  }, [threadFilter]);

  const listQ = useContainers(status, sortBy, sortDir, debouncedThreadId);

  const items = listQ.data?.items || [];
  // Ensure client-side default sort by lastUsedAt desc
  const sorted = [...items].sort((a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime());

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-xl font-semibold">Monitoring / Containers</h1>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <Input
              className="w-64"
              placeholder="Filter by Thread ID (UUID)"
              value={threadFilter}
              onChange={(e) => setThreadFilter(e.target.value)}
              aria-invalid={!!threadFilter && !validateUuid(threadFilter.trim())}
            />
            {threadFilter && (
              <Button variant="ghost" size="sm" onClick={() => setThreadFilter('')}>Clear</Button>
            )}
          </div>
          <Button onClick={() => listQ.refetch()} variant="outline" size="sm">Refresh</Button>
        </div>
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
                <Th>role</Th>
                <Th>status</Th>
                <Th>startedAt</Th>
                <Th>lastUsedAt</Th>
                <Th>killAfterAt</Th>
              </Tr>
            </Thead>
            <Tbody>
              {sorted.map((c) => (
                <React.Fragment key={c.containerId}>
                <Tr>
                  <Td className="font-mono text-xs">
                    <div className="flex items-center gap-2">
                      <span>{c.containerId.substring(0, 8)}</span>
                      <CopyButton ariaLabel="Copy full container id" text={c.containerId} />
                    </div>
                  </Td>
                  <Td className="font-mono text-xs">
                    {c.threadId ? (
                      <Link className="underline" to={`/tracing/thread/${c.threadId}`}>{c.threadId}</Link>
                    ) : (
                      <span className="text-muted-foreground">(none)</span>
                    )}
                  </Td>
                  <Td className="font-mono text-xs">{c.image}</Td>
                  <Td><span className="inline-flex items-center rounded bg-muted px-2 py-0.5 text-xs">{c.role}</span></Td>
                  <Td>{c.status}</Td>
                  <Td>{new Date(c.startedAt).toLocaleString()}</Td>
                  <Td>{new Date(c.lastUsedAt).toLocaleString()}</Td>
                  <Td>{c.killAfterAt ? new Date(c.killAfterAt).toLocaleString() : '-'}</Td>
                </Tr>
                <Tr key={`${c.containerId}-details`}>
                  <Td colSpan={8}>
                    <div className="flex flex-col gap-2 pl-4 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Sidecars:</span>
                        {Array.isArray(c.sidecars) && c.sidecars.length > 0 ? (
                          <div className="flex flex-wrap items-center gap-2">
                            {c.sidecars.map((s) => (
                              <div key={s.containerId} className="inline-flex items-center gap-2 rounded border px-2 py-1">
                                <span className="text-xs rounded bg-muted px-1">{s.role}</span>
                                <span className="font-mono text-xs">{s.containerId.substring(0, 8)}</span>
                                <CopyButton ariaLabel={`Copy sidecar ${s.containerId}`} text={s.containerId} />
                                <span className="text-xs">{s.status}</span>
                                {s.image && <span className="text-xs text-muted-foreground">{s.image}</span>}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">(none)</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Mounts:</span>
                        {Array.isArray(c.mounts) && c.mounts.length > 0 ? (
                          <div className="flex flex-wrap items-center gap-2">
                            {c.mounts.map((m, idx) => (
                              <div key={`${c.containerId}-mount-${idx}`} className="inline-flex items-center gap-1 rounded border px-2 py-1">
                                <span className="font-mono text-xs">{m.source}</span>
                                <span className="text-xs text-muted-foreground">→</span>
                                <span className="font-mono text-xs">{m.destination}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">(none)</span>
                        )}
                      </div>
                    </div>
                  </Td>
                </Tr>
                </React.Fragment>
              ))}
            </Tbody>
          </Table>
        </div>
      )}
    </div>
  );
}
function CopyButton({ text, ariaLabel }: { text: string; ariaLabel: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 800);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={ariaLabel}
          variant="ghost"
          size="sm"
          className="h-6 px-2"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
            } catch (err) {
              // Log rather than mute so failures are observable during dev
              console.warn('clipboard write failed', err);
            }
          }}
        >Copy</Button>
      </TooltipTrigger>
      {copied && <TooltipContent>Copied!</TooltipContent>}
    </Tooltip>
  );
}
