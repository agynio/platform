import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { NodeStatus } from '@/api/types/graph';
import { notifyError } from '@/lib/notify';

import { graphApiService } from '../services/api';

type NodeActionType = 'provision' | 'deprovision';

interface MutationContext {
  previous?: NodeStatus;
  key?: readonly [string, string, string, string];
}

function resolveNodeId(nodeId: string | null | undefined): string | null {
  if (typeof nodeId !== 'string') return null;
  const trimmed = nodeId.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function useNodeAction(nodeId: string | null | undefined) {
  const qc = useQueryClient();
  const resolvedId = resolveNodeId(nodeId);

  return useMutation<void, unknown, NodeActionType, MutationContext>({
    mutationKey: ['graph', 'node', resolvedId ?? 'unknown', 'action'],
    mutationFn: async (action) => {
      if (!resolvedId) {
        throw new Error('Node ID required for node action');
      }
      if (action === 'provision') {
        await graphApiService.provisionNode(resolvedId);
      } else {
        await graphApiService.deprovisionNode(resolvedId);
      }
    },
    onMutate: async (action) => {
      if (!resolvedId) {
        return {};
      }
      const key = ['graph', 'node', resolvedId, 'status'] as const;
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<NodeStatus>(key);

      const optimistic: Partial<NodeStatus> = {};
      if (action === 'provision') {
        optimistic.provisionStatus = { state: 'provisioning' } as NodeStatus['provisionStatus'];
        optimistic.isPaused = false;
      } else {
        optimistic.provisionStatus = { state: 'deprovisioning' } as NodeStatus['provisionStatus'];
        optimistic.isPaused = false;
      }

      qc.setQueryData<NodeStatus>(key, { ...(previous ?? {}), ...optimistic });

      return { previous, key } satisfies MutationContext;
    },
    onError: (error, _action, context) => {
      if (context?.key && context.previous) {
        qc.setQueryData(context.key, context.previous);
      }
      const message = error instanceof Error ? error.message : String(error);
      notifyError(`Action failed: ${message}`);
    },
    onSettled: (_result, _error, _variables, context) => {
      if (context?.key) {
        qc.invalidateQueries({ queryKey: context.key }).catch(() => {});
      }
    },
  });
}
