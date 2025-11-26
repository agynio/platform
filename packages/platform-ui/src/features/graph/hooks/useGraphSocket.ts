import { useEffect, useMemo, useRef, useState } from 'react';
import type { NodeStatusEvent } from '@/lib/graph/types';
import { graphSocketService, type NodeStateEvent } from '../services/socket';

export interface UseGraphSocketOptions {
  nodeIds: string[];
  onStatus?: (event: NodeStatusEvent) => void;
  onState?: (event: NodeStateEvent) => void;
}

export interface UseGraphSocketResult {
  connected: boolean;
}

function normalizeNodeIds(nodeIds: string[]): string[] {
  const uniq = new Set<string>();
  for (const id of nodeIds) {
    if (typeof id === 'string' && id.trim().length > 0) {
      uniq.add(id);
    }
  }
  return Array.from(uniq).sort();
}

export function useGraphSocket(options: UseGraphSocketOptions): UseGraphSocketResult {
  const { onStatus, onState } = options;
  const nodeIds = useMemo(() => normalizeNodeIds(options.nodeIds), [options.nodeIds]);
  const statusHandlerRef = useRef<typeof onStatus>(onStatus);
  const stateHandlerRef = useRef<typeof onState>(onState);
  statusHandlerRef.current = onStatus;
  stateHandlerRef.current = onState;
  const enableStatus = Boolean(onStatus);
  const enableState = Boolean(onState);

  const [connected, setConnected] = useState(() => graphSocketService.isConnected());

  useEffect(() => {
    graphSocketService.connect();
  }, []);

  useEffect(() => {
    const offConnected = graphSocketService.onConnected(() => setConnected(true));
    const offReconnected = graphSocketService.onReconnected(() => setConnected(true));
    const offDisconnected = graphSocketService.onDisconnected(() => setConnected(false));
    return () => {
      offConnected();
      offReconnected();
      offDisconnected();
    };
  }, []);

  useEffect(() => {
    if (nodeIds.length === 0) return;

    const cleanupSubscribe = graphSocketService.subscribeToNodes(nodeIds);

    const disconnectors: Array<() => void> = [];

    if (enableStatus) {
      for (const id of nodeIds) {
        const off = graphSocketService.onNodeStatus(id, (event) => {
          statusHandlerRef.current?.(event);
        });
        disconnectors.push(off);
      }
    }

    if (enableState) {
      for (const id of nodeIds) {
        const off = graphSocketService.onNodeState(id, (event) => {
          stateHandlerRef.current?.(event);
        });
        disconnectors.push(off);
      }
    }

    const resubscribe = () => {
      graphSocketService.subscribeToNodes(nodeIds);
    };
    const offReconnect = graphSocketService.onReconnected(resubscribe);
    const offConnect = graphSocketService.onConnected(resubscribe);

    return () => {
      cleanupSubscribe();
      for (const off of disconnectors) off();
      offReconnect();
      offConnect();
    };
  }, [nodeIds, enableStatus, enableState]);

  return { connected };
}
