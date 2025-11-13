import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { useNodeStatus, useTemplates, useNodeReminders } from '../../graph/hooks';
import { graphSocket } from '../../graph/socket';
import type { NodeStatusEvent } from '../../graph/types';

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

  it('useNodeStatus subscribes to node room, updates on fresh events, and revalidates on reconnect', async () => {
    const subscribeSpy = vi.spyOn(graphSocket, 'subscribe').mockImplementation(() => {});
    const unsubscribeSpy = vi.spyOn(graphSocket, 'unsubscribe').mockImplementation(() => {});
    const connectSpy = vi.spyOn(graphSocket, 'connect').mockImplementation(() => ({ connected: true } as any));
    const isConnectedSpy = vi.spyOn(graphSocket, 'isConnected').mockReturnValue(true);
    let statusHandler: ((ev: NodeStatusEvent) => void) | undefined;
    const onNodeStatusSpy = vi.spyOn(graphSocket, 'onNodeStatus').mockImplementation((_nodeId, handler) => {
      statusHandler = handler;
      return () => {};
    });
    let reconnectHandler: (() => void) | undefined;
    const onReconnectedSpy = vi.spyOn(graphSocket, 'onReconnected').mockImplementation((handler) => {
      reconnectHandler = handler;
      return () => {};
    });
    const onConnectedSpy = vi.spyOn(graphSocket, 'onConnected').mockImplementation((handler) => {
      handler();
      return () => {};
    });
    const onDisconnectedSpy = vi.spyOn(graphSocket, 'onDisconnected').mockImplementation(() => () => {});

    const qc = new QueryClient();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries').mockResolvedValue(undefined as any);
    const wrapper = ({ children }: any) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;

    const { result, unmount } = renderHook(() => useNodeStatus('n1'), { wrapper });

    try {
      await waitFor(() => expect(result.current.data).toBeTruthy());
      expect(result.current.data?.isPaused).toBe(false);
      expect(subscribeSpy).toHaveBeenCalledWith(['node:n1']);
      expect(connectSpy).toHaveBeenCalled();
      expect(onNodeStatusSpy).toHaveBeenCalled();

      const fresh = new Date().toISOString();
      statusHandler?.({ nodeId: 'n1', isPaused: true, updatedAt: fresh } as NodeStatusEvent);
      await waitFor(() => expect(result.current.data?.isPaused).toBe(true));

      const stale = new Date(Date.now() - 60000).toISOString();
      statusHandler?.({ nodeId: 'n1', isPaused: false, updatedAt: stale } as NodeStatusEvent);
      await waitFor(() => expect(result.current.data?.isPaused).toBe(true));

      reconnectHandler?.();
      await waitFor(() => expect(invalidateSpy).toHaveBeenCalled());
    } finally {
      unmount();
      expect(unsubscribeSpy).toHaveBeenCalledWith(['node:n1']);
      subscribeSpy.mockRestore();
      unsubscribeSpy.mockRestore();
      connectSpy.mockRestore();
      isConnectedSpy.mockRestore();
      onNodeStatusSpy.mockRestore();
      onReconnectedSpy.mockRestore();
      onConnectedSpy.mockRestore();
      onDisconnectedSpy.mockRestore();
      invalidateSpy.mockRestore();
    }
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
