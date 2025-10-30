import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { PersistedGraphUpsertRequestUI } from './api';
import { graphSocket } from './socket';
import type { NodeStatus, NodeStatusEvent, ReminderDTO } from './types';
import { z } from 'zod';

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
    // Poll periodically since server may not emit socket events for all cases
    refetchInterval: 2000,
  });

  useEffect(() => {
    graphSocket.connect();
    // dynamic config eliminated; no schema invalidation debounce needed
    const off = graphSocket.onNodeStatus(nodeId, (ev: NodeStatusEvent) => {
      // Authoritative event overwrites optimistic cache
      qc.setQueryData<NodeStatus>(['graph', 'node', nodeId, 'status'], (prev) => ({ ...(prev || {}), ...ev }));

      // dynamic config eliminated; no schema invalidation
    });
    return () => off();
  }, [nodeId, qc]);

  return q;
}

// Reminders polling hook for RemindMe tool nodes
export function useNodeReminders(nodeId: string, enabled: boolean = true) {
  const q = useQuery<{ items: ReminderDTO[] }>({
    queryKey: ['graph', 'node', nodeId, 'reminders'],
    queryFn: () => api.getNodeReminders(nodeId),
    refetchInterval: enabled ? 3500 : false,
    staleTime: 2000,
    enabled: enabled && !!nodeId,
  });
  return q;
}

export function useNodeAction(nodeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (action: 'provision' | 'deprovision') => api.postNodeAction(nodeId, action),
    onMutate: async (action) => {
      await qc.cancelQueries({ queryKey: ['graph', 'node', nodeId, 'status'] });
      const key = ['graph', 'node', nodeId, 'status'] as const;
      const prev = qc.getQueryData<NodeStatus>(key);
      // Optimistic update rules
      let optimistic: Partial<NodeStatus> = {};
      if (action === 'provision') optimistic = { provisionStatus: { state: 'provisioning' as const }, isPaused: false };
      if (action === 'deprovision')
        optimistic = { provisionStatus: { state: 'deprovisioning' as const }, isPaused: false };
      qc.setQueryData(key, { ...(prev || {}), ...optimistic });
      return { prev };
    },
    onError: (err: unknown, _action, ctx) => {
      if (ctx?.prev) qc.setQueryData(['graph', 'node', nodeId, 'status'], ctx.prev);
      const message = err instanceof Error ? err.message : String(err);
      notifyError(`Action failed: ${message}`);
    },
  });
}

// Dynamic config schema only; saving is handled by Builder autosave via node data changes
export function useDynamicConfig(nodeId: string) {
  const schema = useQuery<Record<string, unknown> | null>({
    queryKey: ['graph', 'node', nodeId, 'dynamic', 'schema'],
    queryFn: () => api.getDynamicConfigSchema(nodeId),
    staleTime: 1000 * 60, // cache briefly
    retry: 2,
  });
  // Notify on errors (React Query v5 removed onError callback from useQuery options)
  useEffect(() => {
    if (schema.error) {
      const message = schema.error instanceof Error ? schema.error.message : String(schema.error);
      notifyError(`Dynamic config load failed: ${message}`);
    }
  }, [schema.error]);
  return { schema };
}

// New: full graph save hook
export function useSaveGraph() {
  return useMutation({
    mutationFn: (graph: PersistedGraphUpsertRequestUI) => api.saveFullGraph(graph),
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      notifyError(`Save graph failed: ${message}`);
    },
  });
}

// Typed MCP node state accessors
const McpToolSchema = z.object({
  name: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  inputSchema: z.unknown().optional(),
  outputSchema: z.unknown().optional(),
});

const McpStateSchema = z.object({
  mcp: z
    .object({
      tools: z.array(McpToolSchema).default([]).optional(),
      enabledTools: z.array(z.string()).optional(),
      toolsUpdatedAt: z.union([z.string(), z.number()]).optional(),
    })
    .partial()
    .optional(),
});

type McpTool = z.infer<typeof McpToolSchema>;

export function useMcpNodeState(nodeId: string) {
  const qc = useQueryClient();
  const q = useQuery<{ tools: McpTool[]; enabledTools?: string[] }>({
    queryKey: ['graph', 'node', nodeId, 'state', 'mcp'],
    queryFn: async () => {
      const res = await api.getNodeState(nodeId);
      const state = (res?.state ?? {}) as Record<string, unknown>;
      const parsed = McpStateSchema.safeParse(state);
      if (!parsed.success) return { tools: [], enabledTools: undefined };
      return { tools: parsed.data.mcp?.tools ?? [], enabledTools: parsed.data.mcp?.enabledTools };
    },
    staleTime: 2000,
  });

  useEffect(() => {
    graphSocket.connect();
    const off = graphSocket.onNodeState(nodeId, (ev) => {
      const s = (ev?.state ?? {}) as Record<string, unknown>;
      const parsed = McpStateSchema.safeParse(s);
      if (!parsed.success) return;
      qc.setQueryData<{ tools: McpTool[]; enabledTools?: string[] }>(
        ['graph', 'node', nodeId, 'state', 'mcp'],
        { tools: parsed.data.mcp?.tools ?? [], enabledTools: parsed.data.mcp?.enabledTools },
      );
    });
    return () => off();
  }, [nodeId, qc]);

  const m = useMutation({
    mutationFn: async (enabledTools: string[]) => {
      await api.putNodeState(nodeId, { mcp: { enabledTools } });
      return enabledTools;
    },
    onMutate: async (enabledTools) => {
      await qc.cancelQueries({ queryKey: ['graph', 'node', nodeId, 'state', 'mcp'] });
      const key = ['graph', 'node', nodeId, 'state', 'mcp'] as const;
      const prev = qc.getQueryData<{ tools: McpTool[]; enabledTools?: string[] }>(key);
      qc.setQueryData(key, { tools: prev?.tools ?? [], enabledTools });
      return { prev };
    },
    onError: (err: unknown, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['graph', 'node', nodeId, 'state', 'mcp'], ctx.prev);
      const message = err instanceof Error ? err.message : String(err);
      notifyError(`Failed to update MCP tools: ${message}`);
    },
  });

  return {
    tools: q.data?.tools ?? [],
    enabledTools: q.data?.enabledTools,
    setEnabledTools: (next: string[]) => m.mutate(next),
    isLoading: q.isPending,
  } as const;
}
