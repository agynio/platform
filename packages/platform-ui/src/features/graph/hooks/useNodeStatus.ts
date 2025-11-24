import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NodeStatusEvent } from '@/lib/graph/types';
import { graphApiService } from '../services/api';
import { graphSocketService } from '../services/socket';

type QueryKey = [string, string, string, string];

const BASE_POLL_INTERVAL = 5000;
const MAX_POLL_INTERVAL = 15000;

function toQueryKey(nodeId: string): QueryKey {
  return ['graph', 'node', nodeId, 'status'];
}

export function useNodeStatus(nodeId: string) {
  const qc = useQueryClient();
  const lastUpdatedAt = useRef<number>(0);
  const backoffRef = useRef<number>(BASE_POLL_INTERVAL);
  const [pollInterval, setPollInterval] = useState<number | false>(() => (graphSocketService.isConnected() ? false : BASE_POLL_INTERVAL));

  const query = useQuery({
    queryKey: toQueryKey(nodeId),
    queryFn: () => graphApiService.fetchNodeStatus(nodeId),
    enabled: !!nodeId,
    staleTime: Infinity,
    refetchInterval: pollInterval,
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

    const statusOff = graphSocketService.onNodeStatus(nodeId, (event: NodeStatusEvent) => {
      const parsed = event.updatedAt ? Date.parse(event.updatedAt) : Number.NaN;
      const ts = Number.isFinite(parsed) ? parsed : Date.now();
      if (ts < lastUpdatedAt.current) return;
      lastUpdatedAt.current = ts;
      const { nodeId: _omit, updatedAt: _ignored, ...rest } = event;
      qc.setQueryData(toQueryKey(nodeId), rest);
    });

    const handleConnected = () => {
      backoffRef.current = BASE_POLL_INTERVAL;
      setPollInterval(false);
    };
    const handleReconnected = () => {
      backoffRef.current = BASE_POLL_INTERVAL;
      setPollInterval(false);
      void qc.invalidateQueries({ queryKey: toQueryKey(nodeId) });
    };
    const handleDisconnected = () => {
      const next = backoffRef.current;
      setPollInterval(next);
      backoffRef.current = Math.min(next * 2, MAX_POLL_INTERVAL);
    };

    const offConnected = graphSocketService.onConnected(handleConnected);
    const offReconnected = graphSocketService.onReconnected(handleReconnected);
    const offDisconnected = graphSocketService.onDisconnected(handleDisconnected);

    if (graphSocketService.isConnected()) {
      handleConnected();
    }

    return () => {
      unsubscribe();
      statusOff();
      offConnected();
      offReconnected();
      offDisconnected();
    };
  }, [nodeId, qc]);

  return query;
}
