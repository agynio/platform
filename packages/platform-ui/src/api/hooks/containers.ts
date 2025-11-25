import { useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  listContainers,
  type ContainerItem,
  createContainerTerminalSession,
  type CreateTerminalSessionInput,
  type ContainerTerminalSessionResponse,
} from '@/api/modules/containers';

type ContainerStatusFilter = 'running' | 'stopped' | 'terminating' | 'failed' | 'all';

export function useContainers(status: ContainerStatusFilter = 'running', sortBy = 'lastUsedAt', sortDir: 'asc' | 'desc' = 'desc', threadId?: string) {
  const parameters = useMemo(() => {
    return {
      status: status === 'all' ? undefined : status,
      sortBy,
      sortDir,
      threadId: threadId || undefined,
    } as const;
  }, [status, sortBy, sortDir, threadId]);
  const queryKey = useMemo(
    () => ['containers', { status, sortBy, sortDir, threadId: threadId || null }],
    [status, sortBy, sortDir, threadId],
  );
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
