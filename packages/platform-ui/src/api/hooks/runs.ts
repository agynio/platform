import { useQuery } from '@tanstack/react-query';
import { runs } from '@/api/modules/runs';

export function useThreadRuns(threadId: string | undefined) {
  return useQuery({
    enabled: !!threadId,
    queryKey: ['agents', 'threads', threadId, 'runs'],
    queryFn: () => runs.listByThread(threadId as string),
  });
}

export function useRunMessages(runId: string | undefined, type: 'input' | 'injected' | 'output') {
  return useQuery({
    enabled: !!runId,
    queryKey: ['agents', 'runs', runId, 'messages', type],
    queryFn: () => runs.messages(runId as string, type),
  });
}

