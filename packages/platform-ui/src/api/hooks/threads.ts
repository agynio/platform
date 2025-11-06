import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { threads } from '@/api/modules/threads';

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

