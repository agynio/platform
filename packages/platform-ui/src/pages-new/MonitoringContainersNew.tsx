import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { validate as validateUuid } from 'uuid';
import { useNavigate } from 'react-router-dom';
import { ContainersScreen, type Container as UiContainer, Input, Label } from '@agyn/ui-new';
import { useContainers } from '@/api/hooks/containers';
import type { ContainerItem } from '@/api/modules/containers';
import { ContainerTerminalDialog } from '@/components/monitoring/ContainerTerminalDialog';

function mapStatus(status: ContainerItem['status']): UiContainer['status'] {
  switch (status) {
    case 'running':
      return 'running';
    case 'stopped':
      return 'stopped';
    case 'terminating':
      return 'stopping';
    case 'failed':
      return 'stopped';
    default:
      return 'running';
  }
}

function mapRole(role: ContainerItem['role']): UiContainer['role'] {
  return role === 'dind' ? 'dind' : 'workspace';
}

function toUiContainer(item: ContainerItem, parentId?: string): UiContainer {
  const name = item.image ? item.image.split(':')[0] ?? item.image : item.containerId.slice(0, 12);
  const startedAt = item.startedAt ?? new Date(0).toISOString();
  const lastUsedAt = item.lastUsedAt ?? startedAt;
  return {
    id: item.containerId,
    name,
    containerId: item.containerId,
    image: item.image,
    role: mapRole(item.role),
    status: mapStatus(item.status),
    startedAt,
    lastUsedAt,
    ttl: item.killAfterAt ?? undefined,
    volumes: Array.isArray(item.mounts) ? item.mounts.map((m) => `${m.source} → ${m.destination}`) : [],
    parentId,
    threadId: item.threadId ?? undefined,
  } satisfies UiContainer;
}

export function MonitoringContainersNew() {
  const [threadFilter, setThreadFilter] = useState('');
  const [debouncedThreadId, setDebouncedThreadId] = useState<string | undefined>(undefined);
  const [terminalContainerId, setTerminalContainerId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handle = setTimeout(() => {
      const trimmed = threadFilter.trim();
      setDebouncedThreadId(validateUuid(trimmed) ? trimmed : undefined);
    }, 300);
    return () => clearTimeout(handle);
  }, [threadFilter]);

  const containersQuery = useContainers('running', 'lastUsedAt', 'desc', debouncedThreadId);

  const { containers, lookup } = useMemo(() => {
    const items = containersQuery.data?.items ?? [];
    const map = new Map<string, ContainerItem>();
    const result: UiContainer[] = [];

    for (const item of items) {
      map.set(item.containerId, item);
      result.push(toUiContainer(item));

      if (Array.isArray(item.sidecars)) {
        for (const sidecar of item.sidecars) {
          const synthetic: ContainerItem = {
            containerId: sidecar.containerId,
            threadId: item.threadId,
            image: sidecar.image,
            status: sidecar.status,
            startedAt: item.startedAt,
            lastUsedAt: item.lastUsedAt,
            killAfterAt: item.killAfterAt,
            role: 'dind',
            sidecars: [],
            mounts: [],
          };
          map.set(sidecar.containerId, synthetic);
          result.push(toUiContainer(synthetic, item.containerId));
        }
      }
    }

    const toMs = (iso?: string) => {
      if (!iso) return 0;
      const ts = new Date(iso).getTime();
      return Number.isFinite(ts) ? ts : 0;
    };
    result.sort((a, b) => toMs(b.lastUsedAt ?? b.startedAt) - toMs(a.lastUsedAt ?? a.startedAt));
    return { containers: result, lookup: map };
  }, [containersQuery.data]);

  const terminalContainer = terminalContainerId ? lookup.get(terminalContainerId) ?? null : null;

  if (containersQuery.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading containers…</div>;
  }

  if (containersQuery.isError) {
    const message = containersQuery.error instanceof Error ? containersQuery.error.message : 'Failed to load containers';
    return (
      <div className="p-6 text-sm text-destructive" role="alert">
        {message}
      </div>
    );
  }

  return (
    <>
      <div className="flex h-full flex-col gap-4 p-4">
        <div className="flex items-center gap-3">
          <Label htmlFor="thread-filter">Thread filter (UUID)</Label>
          <Input
            id="thread-filter"
            value={threadFilter}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setThreadFilter(event.target.value)}
            className="w-72"
            placeholder="Optional thread ID"
            aria-invalid={threadFilter.length > 0 && !validateUuid(threadFilter.trim())}
          />
        </div>
        <ContainersScreen
          containers={containers}
          onOpenTerminal={(containerId) => setTerminalContainerId(containerId)}
          onViewThread={(threadId) => navigate(`/agents/threads/${threadId}`)}
          renderSidebar={false}
        />
      </div>
      <ContainerTerminalDialog
        container={terminalContainer ?? null}
        open={terminalContainer != null}
        onClose={() => setTerminalContainerId(null)}
      />
    </>
  );
}
