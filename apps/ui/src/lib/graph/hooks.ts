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
      const prev = qc.getQueryData<NodeStatus>(['graph', 'node', nodeId, 'status']);
      // optimistic hint
      let optimistic: Partial<NodeStatus> = {};
      if (action === 'pause') optimistic = { isPaused: true };
      if (action === 'resume') optimistic = { isPaused: false };
      if (action === 'provision') optimistic = { provisionStatus: { state: 'provisioning' as const } };
      if (action === 'deprovision') optimistic = { provisionStatus: { state: 'deprovisioning' as const } };
      qc.setQueryData(['graph', 'node', nodeId, 'status'], { ...(prev || {}), ...optimistic });
      return { prev };
    },
    onError: (_err, _action, ctx) => {
      if (ctx?.prev) qc.setQueryData(['graph', 'node', nodeId, 'status'], ctx.prev);
    },
  });
}

export function useSetNodeConfig(nodeId: string) {
  return useMutation({
    mutationFn: (cfg: Record<string, unknown>) => api.postNodeConfig(nodeId, cfg),
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
  });
  return { schema, set };
}
