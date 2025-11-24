import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { graphApiService } from '../services/api';
import { graphSocketService, type NodeStateEvent } from '../services/socket';

type QueryKey = [string, string, string, string];

function toQueryKey(nodeId: string): QueryKey {
  return ['graph', 'node', nodeId, 'state'];
}

interface UseNodeStateOptions {
  onUpdated?: (state: Record<string, unknown>) => void;
}

export function useNodeState(nodeId: string, options?: UseNodeStateOptions) {
  const qc = useQueryClient();
  const lastUpdatedAt = useRef<number>(0);
  const onUpdated = options?.onUpdated;

  const query = useQuery({
    queryKey: toQueryKey(nodeId),
    queryFn: async () => {
      const result = await graphApiService.fetchNodeState(nodeId);
      return result.state;
    },
    enabled: !!nodeId,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (query.dataUpdatedAt) {
      lastUpdatedAt.current = Math.max(lastUpdatedAt.current, query.dataUpdatedAt);
    }
  }, [query.dataUpdatedAt]);

  useEffect(() => {
    if (!nodeId) return;
    graphSocketService.connect();
    const unsubscribe = graphSocketService.subscribeToNodes([nodeId]);

    const handler = (event: NodeStateEvent) => {
      const parsed = event.updatedAt ? Date.parse(event.updatedAt) : Number.NaN;
      const ts = Number.isFinite(parsed) ? parsed : Date.now();
      if (ts < lastUpdatedAt.current) return;
      lastUpdatedAt.current = ts;
      qc.setQueryData(toQueryKey(nodeId), event.state ?? {});
      onUpdated?.(event.state ?? {});
    };

    const off = graphSocketService.onNodeState(nodeId, handler);
    const offReconnect = graphSocketService.onReconnected(() => {
      void qc.invalidateQueries({ queryKey: toQueryKey(nodeId) });
    });

    return () => {
      unsubscribe();
      off();
      offReconnect();
    };
  }, [nodeId, qc, onUpdated]);

  const mutation = useMutation({
    mutationFn: async (state: Record<string, unknown>) => {
      const result = await graphApiService.updateNodeState(nodeId, state);
      return result.state;
    },
    onSuccess: (nextState) => {
      qc.setQueryData(toQueryKey(nodeId), nextState);
      onUpdated?.(nextState);
    },
  });

  return {
    state: query.data ?? {},
    query,
    updateState: mutation.mutateAsync,
    update: mutation,
  } as const;
}
