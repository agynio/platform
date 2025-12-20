import { useCallback, useMemo } from 'react';
import { useQuery, type QueryStatus } from '@tanstack/react-query';

import { useTemplates } from '@/lib/graph/hooks';

import { graphApiService } from '../services/api';
import { mapPersistedGraphToNodes } from '../mappers';

type NodeTitleEntry = readonly [string, string];

const GRAPH_QUERY_KEY = ['graph', 'persisted'] as const;

export function useNodeTitleMap() {
  const templatesQuery = useTemplates();
  const graphQuery = useQuery({
    queryKey: GRAPH_QUERY_KEY,
    queryFn: () => graphApiService.fetchGraph(),
    staleTime: 60_000,
  });

  const entries = useMemo<NodeTitleEntry[]>(() => {
    if (!graphQuery.data || !templatesQuery.data) {
      return [];
    }
    const { nodes } = mapPersistedGraphToNodes(graphQuery.data, templatesQuery.data);
    return nodes.map((node) => [node.id, node.title] as const);
  }, [graphQuery.data, templatesQuery.data]);

  const titleMap = useMemo(() => new Map(entries), [entries]);

  const status: QueryStatus = useMemo(() => {
    if (graphQuery.status === 'error' || templatesQuery.status === 'error') {
      return 'error';
    }
    if (graphQuery.status === 'pending' || templatesQuery.status === 'pending') {
      return 'pending';
    }
    return 'success';
  }, [graphQuery.status, templatesQuery.status]);

  const error = graphQuery.error ?? templatesQuery.error ?? null;
  const isLoading = graphQuery.isLoading || templatesQuery.isLoading;
  const isFetching = graphQuery.isFetching || templatesQuery.isFetching;

  const refetch = useCallback(
    () => Promise.all([graphQuery.refetch(), templatesQuery.refetch()]),
    [graphQuery, templatesQuery],
  );

  return {
    titleMap,
    status,
    isLoading,
    isFetching,
    error,
    refetch,
  } as const;
}
