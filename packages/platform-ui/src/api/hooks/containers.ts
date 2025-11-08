import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listContainers, type ContainerItem } from '@/api/modules/containers';

export function useContainers(status = 'running', sortBy = 'lastUsedAt', sortDir: 'asc' | 'desc' = 'desc', threadId?: string) {
  const queryKey = useMemo(() => ['containers', { status, sortBy, sortDir, threadId: threadId || null }], [status, sortBy, sortDir, threadId]);
  const listQ = useQuery<{ items: ContainerItem[] }, Error>({
    queryKey,
    queryFn: async () => listContainers({ status, sortBy, sortDir, threadId }),
    refetchInterval: 5000,
  });
  return listQ;
}
