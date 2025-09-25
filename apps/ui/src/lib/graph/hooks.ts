import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { graphSocket } from './socket';
import type { NodeStatus, NodeStatusEvent, TemplateSchema } from './types';

export function useTemplates() {
  return useQuery({
    queryKey: ['graph', 'templates'],
    queryFn: () => api.getTemplates(),
    staleTime: 1000 * 60 * 60, // 1h
  });
}

import { notifyError } from '../notify';

export function useNodeStatus(nodeId: string) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['graph', 'node', nodeId, 'status'],
    queryFn: () => api.getNodeStatus(nodeId),
    staleTime: Infinity,
  });

  useEffect(() => {
    const sock = graphSocket.connect();
    const off = graphSocket.onNodeStatus(nodeId, (ev: NodeStatusEvent) => {
      // Authoritative event overwrites optimistic cache
      qc.setQueryData<NodeStatus>(['graph', 'node', nodeId, 'status'], (prev) => ({ ...(prev || {}), ...ev }));
    });
    return () => off();
  }, [nodeId, qc]);

  return q;
}

export function useNodeAction(nodeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (action: 'pause' | 'resume' | 'provision' | 'deprovision') => api.postNodeAction(nodeId, action),
    onMutate: async (action) => {
      await qc.cancelQueries({ queryKey: ['graph', 'node', nodeId, 'status'] });
      const key = ['graph', 'node', nodeId, 'status'] as const;
      const prev = qc.getQueryData<NodeStatus>(key);
      // Optimistic update rules
      let optimistic: Partial<NodeStatus> = {};
      if (action === 'provision') optimistic = { provisionStatus: { state: 'provisioning' as const }, isPaused: false };
      if (action === 'deprovision') optimistic = { provisionStatus: { state: 'deprovisioning' as const }, isPaused: false };
      if (action === 'pause') optimistic = { isPaused: true };
      if (action === 'resume') optimistic = { isPaused: false };
      qc.setQueryData(key, { ...(prev || {}), ...optimistic });
      return { prev };
    },
    onError: (err: unknown, _action, ctx) => {
      if (ctx?.prev) qc.setQueryData(['graph', 'node', nodeId, 'status'], ctx.prev);
      notifyError(`Action failed: ${String((err as any)?.message || err)}`);
    },
  });
}

export function useSetNodeConfig(nodeId: string) {
  return useMutation({
    mutationFn: (cfg: Record<string, unknown>) => api.postNodeConfig(nodeId, cfg),
    onError: (err) => notifyError(`Save config failed: ${String((err as any)?.message || err)}`),
  });
}

export function useDynamicConfig(nodeId: string) {
  const schema = useQuery({
    queryKey: ['graph', 'node', nodeId, 'dynSchema'],
    queryFn: () => api.getDynamicConfigSchema(nodeId),
    staleTime: 1000 * 60 * 10,
  });
  const set = useMutation({
    mutationFn: (cfg: Record<string, unknown>) => api.postDynamicConfig(nodeId, cfg),
    onError: (err) => notifyError(`Save dynamic config failed: ${String((err as any)?.message || err)}`),
  });
  return { schema, set };
}
