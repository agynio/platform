import { useMemo } from 'react';
import { useContainers } from '@/api/hooks/containers';
import { toContainersView } from './mappers';

export function useMonitoringContainers() {
  const query = useContainers('all', 'lastUsedAt', 'desc');

  const view = useMemo(() => {
    const items = query.data?.items ?? [];
    return toContainersView(items);
  }, [query.data]);

  return {
    containers: view.containers,
    itemById: view.itemById,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error ?? null,
    refetch: query.refetch,
  } as const;
}
