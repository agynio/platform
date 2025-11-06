import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listContainers, type ContainerItem } from '@/api/modules/containers';

export function useContainers(status = 'running', sortBy = 'lastUsedAt', sortDir: 'asc' | 'desc' = 'desc') {
  const queryKey = useMemo(() => ['containers', { status, sortBy, sortDir }], [status, sortBy, sortDir]);
  const listQ = useQuery<{ items: ContainerItem[] }, Error>({
    queryKey,
    queryFn: async () => listContainers({ status, sortBy, sortDir }),
    refetchInterval: 5000,
  });
  return listQ;
}

