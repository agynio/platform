import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useContainers, containersQueryKey, type ContainerStatusFilter } from '@/api/hooks/containers';
import { listContainers } from '@/api/modules/containers';
import { toContainersView } from './mappers';

type StatusCounts = {
  running: number;
  stopped: number;
  starting: number;
  stopping: number;
  all: number;
};

const INITIAL_COUNTS: StatusCounts = { running: 0, stopped: 0, starting: 0, stopping: 0, all: 0 };

export function useMonitoringContainers() {
  const [status, setStatus] = useState<ContainerStatusFilter>('running');
  const queryClient = useQueryClient();
  const query = useContainers(status, 'lastUsedAt', 'desc');
  const hasPrefetchedAllRef = useRef(false);

  useEffect(() => {
    if (status === 'all') return;
    if (!query.data || hasPrefetchedAllRef.current) return;
    hasPrefetchedAllRef.current = true;
    queryClient
      .prefetchQuery(
        containersQueryKey('all', 'lastUsedAt', 'desc'),
        () => listContainers({ status: 'all', sortBy: 'lastUsedAt', sortDir: 'desc' }),
      )
      .catch(() => {
        hasPrefetchedAllRef.current = false;
      });
  }, [status, query.data, queryClient]);

  const view = useMemo(() => {
    const items = query.data?.items ?? [];
    return toContainersView(items);
  }, [query.data]);

  const allData = queryClient.getQueryData<{ items: Parameters<typeof toContainersView>[0] }>(
    containersQueryKey('all', 'lastUsedAt', 'desc'),
  );

  const counts = useMemo(() => {
    const sourceItems = allData?.items ?? query.data?.items ?? [];
    if (!sourceItems.length) return INITIAL_COUNTS;
    const aggregate = toContainersView(sourceItems).containers.reduce<StatusCounts>((acc, item) => {
      acc.all += 1;
      switch (item.status) {
        case 'running':
          acc.running += 1;
          break;
        case 'stopped':
          acc.stopped += 1;
          break;
        case 'starting':
          acc.starting += 1;
          break;
        case 'stopping':
          acc.stopping += 1;
          break;
        default:
          break;
      }
      return acc;
    }, { ...INITIAL_COUNTS });
    return aggregate;
  }, [allData, query.data]);

  return {
    status,
    setStatus,
    containers: view.containers,
    itemById: view.itemById,
    counts,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error ?? null,
    refetch: query.refetch,
  } as const;
}
