import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { graph as api } from '@/api/modules/graph';
import type { PersistedGraphUpsertRequestUI } from '@/api/modules/graph';
import { graphSocket } from './socket';
import type { NodeStatus, NodeStatusEvent, ReminderDTO, ReminderCountEvent } from './types';
import { notifyError } from '../notify';

export function useTemplates() {
  return useQuery({
    queryKey: ['graph', 'templates'],
    queryFn: () => api.getTemplates(),
    staleTime: 1000 * 60 * 60, // 1h
  });
}

export function useNodeStatus(nodeId: string) {
  const qc = useQueryClient();
  const lastUpdatedRef = useRef<number>(0);
  const pollBackoffRef = useRef<number>(5000);
  const [pollInterval, setPollInterval] = useState<number | false>(() => (graphSocket.isConnected() ? false : 5000));
  const q = useQuery({
    queryKey: ['graph', 'node', nodeId, 'status'],
    queryFn: () => api.getNodeStatus(nodeId),
    staleTime: Infinity,
    refetchInterval: pollInterval,
  });

  useEffect(() => {
    if (!nodeId) return;
    const socket = graphSocket.connect();
    const room = `node:${nodeId}`;
    graphSocket.subscribe([room]);
    const handler = (ev: NodeStatusEvent) => {
      const parsedAt = ev.updatedAt ? Date.parse(ev.updatedAt) : Number.NaN;
      const at = Number.isFinite(parsedAt) ? parsedAt : Date.now();
      if (at < lastUpdatedRef.current) return;
      lastUpdatedRef.current = at;
      const { nodeId: _omit, updatedAt: _ignored, ...rest } = ev;
      qc.setQueryData<NodeStatus>(['graph', 'node', nodeId, 'status'], (prev) => ({ ...(prev || {}), ...rest }));
    };
    const offStatus = graphSocket.onNodeStatus(nodeId, handler);
    const onConnected = () => {
      pollBackoffRef.current = 5000;
      setPollInterval(false);
    };
    const onReconnected = () => {
      pollBackoffRef.current = 5000;
      setPollInterval(false);
      qc.invalidateQueries({ queryKey: ['graph', 'node', nodeId, 'status'] }).catch(() => {});
    };
    const onDisconnected = () => {
      const next = pollBackoffRef.current;
      setPollInterval(next);
      pollBackoffRef.current = Math.min(next * 2, 15000);
    };
    const offConnected = graphSocket.onConnected(onConnected);
    const offReconnected = graphSocket.onReconnected(onReconnected);
    const offDisconnected = graphSocket.onDisconnected(onDisconnected);
    if (socket?.connected) {
      onConnected();
    }
    return () => {
      offStatus();
      offConnected();
      offReconnected();
      offDisconnected();
      graphSocket.unsubscribe([room]);
    };
  }, [nodeId, qc]);

  useEffect(() => {
    if (q.dataUpdatedAt) {
      lastUpdatedRef.current = Math.max(lastUpdatedRef.current, q.dataUpdatedAt);
    }
  }, [q.dataUpdatedAt]);

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

// Reminder count hook: one-shot GET + socket updates
export function useReminderCount(nodeId: string, enabled: boolean = true) {
  const qc = useQueryClient();
  const lastUpdatedRef = useRef<number>(0);
  const q = useQuery<{ count: number; updatedAt: string } | undefined>({
    queryKey: ['graph', 'node', nodeId, 'reminders', 'count'],
    queryFn: async () => {
      const res = await api.getNodeReminders(nodeId);
      const updatedAt = new Date().toISOString();
      const count = res?.items?.length || 0;
      lastUpdatedRef.current = Date.now();
      return { count, updatedAt };
    },
    enabled: enabled && !!nodeId,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (!enabled || !nodeId) return;
    graphSocket.connect();
    const room = `node:${nodeId}`;
    graphSocket.subscribe([room]);
    const off = graphSocket.onReminderCount(nodeId, (ev: ReminderCountEvent) => {
      const at = Date.parse(ev.updatedAt || new Date().toISOString());
      if (!Number.isFinite(at)) return;
      // Accept only if newer than last applied
      if (at >= lastUpdatedRef.current) {
        lastUpdatedRef.current = at;
        qc.setQueryData(['graph', 'node', nodeId, 'reminders', 'count'], { count: ev.count, updatedAt: ev.updatedAt });
      }
    });
    const onConnect = () => {
      qc.invalidateQueries({ queryKey: ['graph', 'node', nodeId, 'reminders', 'count'] }).catch(() => {});
    };
    const offConnected = graphSocket.onConnected(onConnect);
    return () => {
      off();
      offConnected();
      graphSocket.unsubscribe([room]);
    };
  }, [nodeId, qc, enabled]);

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
      if (action === 'provision') optimistic = { provisionStatus: { state: 'provisioning' as const } };
      if (action === 'deprovision') optimistic = { provisionStatus: { state: 'deprovisioning' as const } };
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
    mutationFn: async (graph: PersistedGraphUpsertRequestUI) => {
      void graph;
      return api.getFullGraph();
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      notifyError(`Save graph failed: ${message}`);
    },
  });
}

type McpTool = { name: string; description?: string; title?: string };

export function useMcpTools(nodeId: string | null | undefined) {
  const resolvedId = typeof nodeId === 'string' && nodeId.length > 0 ? nodeId : null;
  const queryKey = useMemo(
    () => (resolvedId ? (['graph', 'node', resolvedId, 'tools'] as const) : null),
    [resolvedId],
  );
  const safeQueryKey = useMemo(
    () => queryKey ?? (['graph', 'node', '__none__', 'tools'] as const),
    [queryKey],
  );

  const q = useQuery<{ tools: McpTool[]; updatedAt?: string }>({
    queryKey: safeQueryKey,
    queryFn: async () => {
      if (!resolvedId) return { tools: [], updatedAt: undefined };
      const res = await api.discoverNodeTools(resolvedId);
      const tools = Array.isArray(res?.tools)
        ? res.tools
            .filter((tool) => tool && typeof tool.name === 'string')
            .map((tool) => ({
              name: tool.name,
              description: tool.description,
            }))
        : [];
      return { tools, updatedAt: res?.updatedAt };
    },
    enabled: resolvedId !== null,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const discoverTools = useCallback(async () => {
    if (!resolvedId) return;
    await q.refetch();
  }, [q, resolvedId]);

  return {
    tools: q.data?.tools ?? [],
    updatedAt: q.data?.updatedAt,
    discoverTools,
    isLoading: resolvedId ? q.isFetching : false,
  } as const;
}
