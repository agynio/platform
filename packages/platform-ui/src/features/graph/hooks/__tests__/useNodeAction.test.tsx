import React, { type ReactNode } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { NodeStatus } from '@/api/types/graph';

import { useNodeAction } from '../useNodeAction';

const serviceMocks = vi.hoisted(() => ({
  provisionNode: vi.fn(),
  deprovisionNode: vi.fn(),
}));

const notifyError = vi.hoisted(() => vi.fn());

vi.mock('../../services/api', () => ({
  graphApiService: serviceMocks,
}));

vi.mock('@/lib/notify', () => ({
  notifyError,
}));

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { wrapper, queryClient };
}

describe('useNodeAction', () => {
  beforeEach(() => {
    serviceMocks.provisionNode.mockReset();
    serviceMocks.deprovisionNode.mockReset();
    notifyError.mockReset();
  });

  it('runs provision action and updates status optimistically', async () => {
    const { wrapper, queryClient } = createWrapper();
    const { result } = renderHook(() => useNodeAction('node-123'), { wrapper });
    const key = ['graph', 'node', 'node-123', 'status'] as const;
    queryClient.setQueryData<NodeStatus>(key, { provisionStatus: { state: 'not_ready' } });
    serviceMocks.provisionNode.mockResolvedValue(undefined);

    await act(async () => {
      await result.current.mutateAsync('provision');
    });

    expect(serviceMocks.provisionNode).toHaveBeenCalledWith('node-123');
    expect(queryClient.getQueryData<NodeStatus>(key)?.provisionStatus?.state).toBe('provisioning');
  });

  it('runs deprovision action and reverts on error', async () => {
    const { wrapper, queryClient } = createWrapper();
    const { result } = renderHook(() => useNodeAction('node-999'), { wrapper });
    const key = ['graph', 'node', 'node-999', 'status'] as const;
    queryClient.setQueryData<NodeStatus>(key, { provisionStatus: { state: 'ready' } });
    const error = new Error('failed');
    serviceMocks.deprovisionNode.mockRejectedValue(error);

    await act(async () => {
      await expect(result.current.mutateAsync('deprovision')).rejects.toThrow(error);
    });

    expect(serviceMocks.deprovisionNode).toHaveBeenCalledWith('node-999');
    expect(queryClient.getQueryData<NodeStatus>(key)?.provisionStatus?.state).toBe('ready');
    expect(notifyError).toHaveBeenCalledWith(expect.stringContaining('Action failed'));
  });

  it('throws when node id is missing', async () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useNodeAction(null), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync('provision')).rejects.toThrow('Node ID required for node action');
    });
  });
});
