import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { graphApiService } from '../services/api';
import { mapPersistedGraphToNodes } from '../mappers';

type NodeTitleEntry = readonly [string, string];

const QUERY_KEY = ['graph', 'node-title-map'] as const;

async function fetchNodeTitleEntries(): Promise<NodeTitleEntry[]> {
  const [graph, templates] = await Promise.all([
    graphApiService.fetchGraph(),
    graphApiService.fetchTemplates(),
  ]);

  const { nodes } = mapPersistedGraphToNodes(graph, templates);
  return nodes.map((node) => [node.id, node.title] as const);
}

export function useNodeTitleMap() {
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchNodeTitleEntries,
    staleTime: 60_000,
  });

  const titleMap = useMemo(() => new Map(query.data ?? []), [query.data]);

  return {
    titleMap,
    status: query.status,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  } as const;
}
