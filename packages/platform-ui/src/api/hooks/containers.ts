import { useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  listContainers,
  type ContainerItem,
  createContainerTerminalSession,
  type CreateTerminalSessionInput,
  type ContainerTerminalSessionResponse,
} from '@/api/modules/containers';

export type ContainerStatusFilter = 'running' | 'stopped' | 'terminating' | 'failed' | 'all';

export const containersQueryKey = (
  status: ContainerStatusFilter,
  sortBy: string,
  sortDir: 'asc' | 'desc',
  threadId?: string,
) => ['containers', { status, sortBy, sortDir, threadId: threadId || null }] as const;

export function useContainers(status: ContainerStatusFilter = 'running', sortBy = 'lastUsedAt', sortDir: 'asc' | 'desc' = 'desc', threadId?: string) {
  const parameters = useMemo(() => {
    const toApiStatus = (value: ContainerStatusFilter | undefined): ContainerStatusFilter | undefined => {
      if (!value) return undefined;
      if (value === 'all') return 'all';
      return value;
    };
    return {
      status: toApiStatus(status),
      sortBy,
      sortDir,
      threadId: threadId || undefined,
    } as const;
  }, [status, sortBy, sortDir, threadId]);
  const queryKey = useMemo(() => containersQueryKey(status, sortBy, sortDir, threadId), [status, sortBy, sortDir, threadId]);
  const listQ = useQuery<{ items: ContainerItem[] }, Error>({
    queryKey,
    queryFn: async () => listContainers(parameters),
    refetchInterval: 5000,
  });
  return listQ;
}

export function useCreateContainerTerminalSession() {
  return useMutation<ContainerTerminalSessionResponse, Error, { containerId: string; body?: CreateTerminalSessionInput }>(
    {
      mutationFn: ({ containerId, body }) => createContainerTerminalSession(containerId, body),
    },
  );
}
