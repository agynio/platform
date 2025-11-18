import React from 'react';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { useNodeAction, useNodeStatus } from '../../graph/hooks';
import type { NodeStatusEvent } from '../../graph/types';
import type * as ConfigModule from '@/config';
import { createSocketTestServer, type TestSocketServer } from '../../../../__tests__/socketServer.helper';

vi.mock('@/api/modules/graph', () => ({
  graph: {
    postNodeAction: vi.fn(async () => {}),
    getNodeStatus: vi.fn(async () => ({ isPaused: false, provisionStatus: { state: 'not_ready' } })),
  },
}));

const notify = vi.fn();
vi.mock('../../notify', () => ({ notifyError: (..._args: any[]) => notify('error'), notifySuccess: (..._args: any[]) => notify('success') }));

let socketBaseUrl = 'http://127.0.0.1:0';

vi.mock('@/config', async () => {
  const actual = await vi.importActual<typeof ConfigModule>('@/config');
  return {
    ...actual,
    getSocketBaseUrl: () => socketBaseUrl,
  };
});

let socketServer: TestSocketServer;

function createWrapper() {
  const qc = new QueryClient();
  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { wrapper: Wrapper, qc };
}

describe('optimistic actions with socket reconciliation', () => {
  beforeAll(async () => {
    socketServer = await createSocketTestServer();
    socketBaseUrl = socketServer.baseUrl;
  });

  afterAll(async () => {
    await socketServer.close();
  });

  it('provision optimistic then reconciles to ready on event', async () => {
    const { wrapper } = createWrapper();
    const { result: statusQ } = renderHook(() => useNodeStatus('n1'), { wrapper });
    await waitFor(() => expect(statusQ.current.data).toBeTruthy());

    const { result: act } = renderHook(() => useNodeAction('n1'), { wrapper });
    await act.current.mutateAsync('provision');

    await waitFor(() => expect(statusQ.current.data?.provisionStatus?.state).toBe('provisioning'));

    await socketServer.waitForRoom('node:n1');

    socketServer.emitNodeStatus({ nodeId: 'n1', provisionStatus: { state: 'ready' } } as NodeStatusEvent);

    await waitFor(() => expect(statusQ.current.data?.provisionStatus?.state).toBe('ready'));
  });

  it('rollback on error and notify (provision)', async () => {
    const { wrapper } = createWrapper();
    const { graph } = await import('@/api/modules/graph');
    (graph.postNodeAction as any).mockImplementationOnce(async () => { throw new Error('boom'); });
    const { result: statusQ } = renderHook(() => useNodeStatus('n3'), { wrapper });
    await waitFor(() => expect(statusQ.current.data).toBeTruthy());
    const before = statusQ.current.data;
    const { result: act } = renderHook(() => useNodeAction('n3'), { wrapper });
    await expect(act.current.mutateAsync('provision')).rejects.toThrow();
    await waitFor(() => expect(statusQ.current.data).toEqual(before));
    expect(notify).toHaveBeenCalled();
  });
});
