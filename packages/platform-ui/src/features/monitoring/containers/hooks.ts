import { useCallback, useMemo, useState } from 'react';
import { useContainers, type ContainerStatusFilter } from '@/api/hooks/containers';
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
  const query = useContainers(status, 'lastUsedAt', 'desc');
  const countsQuery = useContainers('all', 'lastUsedAt', 'desc');

  const { data: listData, isLoading: listIsLoading, isFetching: listIsFetching, error: listError, refetch: listRefetch } = query;
  const {
    data: countsData,
    isLoading: countsIsLoading,
    isFetching: countsIsFetching,
    error: countsError,
    refetch: countsRefetch,
  } = countsQuery;

  const view = useMemo(() => {
    const items = listData?.items ?? [];
    return toContainersView(items);
  }, [listData]);

  const counts = useMemo(() => {
    const sourceItems = countsData?.items ?? listData?.items ?? [];
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
  }, [countsData, listData]);

  const refetch = useCallback(() => {
    countsRefetch();
    return listRefetch();
  }, [countsRefetch, listRefetch]);

  return {
    status,
    setStatus,
    containers: view.containers,
    itemById: view.itemById,
    counts,
    isLoading: listIsLoading || (!countsData && countsIsLoading),
    isFetching: listIsFetching || countsIsFetching,
    error: listError ?? countsError ?? null,
    refetch,
  } as const;
}
