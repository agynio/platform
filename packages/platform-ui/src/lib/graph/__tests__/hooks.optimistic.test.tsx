import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { useNodeAction, useNodeStatus } from '../../graph/hooks';
import { graphSocket } from '../../graph/socket';
import type { NodeStatusEvent } from '../../graph/types';

vi.mock('@/api/graph', () => ({
  api: {
    postNodeAction: vi.fn(async () => {}),
    getNodeStatus: vi.fn(async () => ({ isPaused: false, provisionStatus: { state: 'not_ready' } })),
  },
}));

const notify = vi.fn();
vi.mock('../../notify', () => ({ notifyError: (..._args: any[]) => notify('error'), notifySuccess: (..._args: any[]) => notify('success') }));

function createWrapper() {
  const qc = new QueryClient();
  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { wrapper: Wrapper, qc };
}

describe('optimistic actions with socket reconciliation', () => {
  it('provision optimistic then reconciles to ready on event', async () => {
    const { wrapper } = createWrapper();
    const { result: statusQ } = renderHook(() => useNodeStatus('n1'), { wrapper });
    await waitFor(() => expect(statusQ.current.data).toBeTruthy());

    const { result: act } = renderHook(() => useNodeAction('n1'), { wrapper });
    await act.current.mutateAsync('provision');

    // cache should show provisioning
    await waitFor(() => expect(statusQ.current.data?.provisionStatus?.state).toBe('provisioning'));

    // Simulate socket event to ready
    const anySock: any = graphSocket as any;
    for (const [nodeId, set] of anySock.listeners as Map<string, Set<(...args: unknown[]) => unknown>>) {
      if (nodeId === 'n1') for (const fn of set) fn({ nodeId: 'n1', provisionStatus: { state: 'ready' } } as NodeStatusEvent);
    }

    await waitFor(() => expect(statusQ.current.data?.provisionStatus?.state).toBe('ready'));
  });

  // Pause/Resume removed; optimistic pause test dropped

  it('rollback on error and notify (provision)', async () => {
    const { wrapper } = createWrapper();
    const { api } = await import('@/api/graph');
    (api.postNodeAction as any).mockImplementationOnce(async () => { throw new Error('boom'); });
    const { result: statusQ } = renderHook(() => useNodeStatus('n3'), { wrapper });
    await waitFor(() => expect(statusQ.current.data).toBeTruthy());
    const before = statusQ.current.data;
    const { result: act } = renderHook(() => useNodeAction('n3'), { wrapper });
    await expect(act.current.mutateAsync('provision')).rejects.toThrow();
    await waitFor(() => expect(statusQ.current.data).toEqual(before));
    expect(notify).toHaveBeenCalled();
  });
});
