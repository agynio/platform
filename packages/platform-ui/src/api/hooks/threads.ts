import { useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { threads } from '@/api/modules/threads';
import type { ApiError } from '@/api/http';
import { listContainers } from '@/api/modules/containers';
import { graphSocket } from '@/lib/graph/socket';
import type { ThreadMetrics, ThreadNode, ThreadReminder, AgentQueueItem } from '@/api/types/agents';
import type { ContainerItem } from '@/api/modules/containers';

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export const threadQueueQueryKey = (threadId: string | undefined) => ['agents', 'threads', threadId, 'queue'] as const;

export function invalidateThreadQueue(queryClient: QueryClient, threadId: string | undefined): Promise<void> {
  if (!threadId) return Promise.resolve();
  return queryClient.invalidateQueries({ queryKey: threadQueueQueryKey(threadId) });
}

export function useThreadRoots(status: 'open' | 'closed' | 'all') {
  return useQuery({
    queryKey: ['agents', 'threads', 'roots', status],
    queryFn: () => threads.roots(status, 100),
  });
}

export function useThreadChildren(id: string | undefined, status: 'open' | 'closed' | 'all') {
  return useQuery({
    enabled: !!id,
    queryKey: ['agents', 'threads', id, 'children', status],
    queryFn: () => threads.children(id as string, status),
  });
}

export function useThreadById(threadId: string | undefined) {
  return useQuery<ThreadNode, ApiError>({
    enabled: !!threadId,
    queryKey: ['agents', 'threads', 'by-id', threadId],
    queryFn: () => threads.getById(threadId as string),
    retry: (failureCount, error) => {
      if (error?.response?.status === 404) return false;
      return failureCount < 2;
    },
  });
}

export function useToggleThreadStatus(id: string, current: 'open' | 'closed') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const next = current === 'open' ? 'closed' : 'open';
      await threads.patchStatus(id, next);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['agents', 'threads'] });
    },
  });
}

const defaultMetrics: ThreadMetrics = { remindersCount: 0, containersCount: 0, activity: 'idle', runsCount: 0 };

export function useThreadMetrics(threadId: string | undefined) {
  const qc = useQueryClient();
  const queryKey = useMemo(() => ['agents', 'threads', threadId, 'metrics'] as const, [threadId]);
  const shouldPoll = !!threadId;
  const q = useQuery<ThreadMetrics>({
    enabled: !!threadId,
    queryKey,
    queryFn: () => threads.metrics(threadId as string),
    staleTime: 5000,
    refetchInterval: shouldPoll ? 15000 : false,
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    if (!threadId) return;
    const offActivity = graphSocket.onThreadActivityChanged((payload) => {
      if (payload.threadId !== threadId) return;
      qc.setQueryData<ThreadMetrics>(queryKey, (prev) => ({ ...(prev ?? defaultMetrics), activity: payload.activity }));
    });
    const offReminders = graphSocket.onThreadRemindersCount((payload) => {
      if (payload.threadId !== threadId) return;
      qc.setQueryData<ThreadMetrics>(queryKey, (prev) => ({ ...(prev ?? defaultMetrics), remindersCount: payload.remindersCount }));
    });
    const offReconnect = graphSocket.onReconnected(() => {
      qc.invalidateQueries({ queryKey }).catch(() => {});
    });
    return () => {
      offActivity();
      offReminders();
      offReconnect();
    };
  }, [threadId, qc, queryKey]);

  return q;
}

export function useThreadReminders(threadId: string | undefined, enabled: boolean = true) {
  const qc = useQueryClient();
  const queryKey = useMemo(() => ['agents', 'threads', threadId, 'reminders'] as const, [threadId]);
  const isValidThread = !!threadId && UUID_REGEX.test(threadId);
  const q = useQuery<{ items: ThreadReminder[] }>({
    enabled: enabled && isValidThread,
    queryKey,
    queryFn: () => threads.reminders(threadId as string),
    staleTime: 1500,
  });

  useEffect(() => {
    if (!threadId || !enabled || !isValidThread) return;
    const offReminders = graphSocket.onThreadRemindersCount((payload) => {
      if (payload.threadId !== threadId) return;
      qc.invalidateQueries({ queryKey }).catch(() => {});
    });
    const offReconnect = graphSocket.onReconnected(() => {
      qc.invalidateQueries({ queryKey }).catch(() => {});
    });
    return () => {
      offReminders();
      offReconnect();
    };
  }, [threadId, enabled, isValidThread, qc, queryKey]);

  return q;
}

export function useThreadContainersCount(threadId: string | undefined) {
  const queryKey = useMemo(() => ['agents', 'threads', threadId, 'containers', 'badge'] as const, [threadId]);
  const isValidThread = !!threadId && UUID_REGEX.test(threadId);
  return useQuery<number>({
    enabled: isValidThread,
    queryKey,
    queryFn: async () => {
      const result = await listContainers({ status: 'running', sortBy: 'lastUsedAt', sortDir: 'desc', threadId: threadId as string });
      return result.items.length;
    },
    staleTime: 5000,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

export function useThreadContainers(threadId: string | undefined, enabled: boolean = true) {
  const qc = useQueryClient();
  const queryKey = useMemo(() => ['agents', 'threads', threadId, 'containers'] as const, [threadId]);
  const isValidThread = !!threadId && UUID_REGEX.test(threadId);
  const allowPolling = enabled && isValidThread;
  const q = useQuery<{ items: ContainerItem[] }>({
    enabled: allowPolling,
    queryKey,
    queryFn: () => listContainers({ status: 'running', sortBy: 'lastUsedAt', sortDir: 'desc', threadId: threadId as string }),
    staleTime: 5000,
    refetchInterval: allowPolling ? 5000 : false,
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    if (!threadId || !enabled || !isValidThread) return;
    const offReconnect = graphSocket.onReconnected(() => {
      qc.invalidateQueries({ queryKey }).catch(() => {});
    });
    return () => {
      offReconnect();
    };
  }, [threadId, enabled, isValidThread, qc, queryKey]);

  return q;
}

export function useThreadQueue(threadId: string | undefined, enabled: boolean = true) {
  const qc = useQueryClient();
  const queryKey = useMemo(() => threadQueueQueryKey(threadId), [threadId]);
  const isValidThread = !!threadId && UUID_REGEX.test(threadId);
  const allow = enabled && isValidThread;
  const q = useQuery<{ items: AgentQueueItem[] }>({
    enabled: allow,
    queryKey,
    queryFn: () => threads.queue(threadId as string),
    staleTime: 1500,
  });

  useEffect(() => {
    if (!allow || !threadId) return;
    const offReconnect = graphSocket.onReconnected(() => {
      invalidateThreadQueue(qc, threadId).catch(() => {});
    });
    return () => {
      offReconnect();
    };
  }, [allow, threadId, qc]);

  return q;
}
