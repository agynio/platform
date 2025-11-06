import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { useNodeStatus, useTemplates, useNodeReminders } from '../../graph/hooks';
import { graphSocket } from '../../graph/socket';

// Mock http client used by modules (avoid TDZ with vi.hoisted)
const hoisted = vi.hoisted(() => ({ getMock: vi.fn() }));
vi.mock('@/api/http', () => ({ http: { get: hoisted.getMock }, tracingHttp: { get: vi.fn() } }));

describe('graph hooks', () => {
  beforeEach(() => {
    hoisted.getMock.mockReset();
    hoisted.getMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/api/graph/templates')) return [{ name: 'x', title: 'X', kind: 'tool', sourcePorts: {}, targetPorts: {} }];
      if (String(url).includes('/status')) return { isPaused: false };
      if (String(url).includes('/reminders')) return { items: [{ id: '1', threadId: 't', note: 'n', at: new Date().toISOString() }] };
      return {};
    });
  });

  it('useTemplates fetches and caches', async () => {
    const qc = new QueryClient();
    const wrapper = ({ children }: any) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useTemplates(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(result.current.data?.[0]?.name).toBe('x');
  });

  it('useNodeStatus receives socket updates', async () => {
    const qc = new QueryClient();
    const wrapper = ({ children }: any) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;

    // intercept socket and emit
    const off = graphSocket.onNodeStatus('n1', () => {});
    off(); // ensure registry works

    const { result } = renderHook(() => useNodeStatus('n1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(result.current.data?.isPaused).toBe(false);

    // simulate socket event
    const anySock: any = graphSocket as any;
    for (const [nodeId, set] of anySock.listeners as Map<string, Set<(...args: unknown[]) => unknown>>) {
      if (nodeId === 'n1') for (const fn of set) fn({ nodeId: 'n1', isPaused: true });
    }

    await waitFor(() => expect(result.current.data?.isPaused).toBe(true));
  });

  it('useNodeReminders polls and returns items', async () => {
    const qc = new QueryClient();
    const wrapper = ({ children }: any) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useNodeReminders('n1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(result.current.data?.items?.length).toBe(1);
    expect(result.current.data?.items?.[0]?.note).toBe('n');
  });

  it('useNodeReminders disabled when flag false', async () => {
    const qc = new QueryClient();
    const wrapper = ({ children }: any) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useNodeReminders('n1', false), { wrapper });
    // No data fetched since disabled
    expect(result.current.isPaused).toBeFalsy();
    expect(result.current.data).toBeUndefined();
  });
});
