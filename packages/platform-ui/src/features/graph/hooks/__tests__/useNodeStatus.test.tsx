import React, { type ReactNode } from 'react';
import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import type { useNodeStatus as UseNodeStatusFn } from '../useNodeStatus';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apiMocks = vi.hoisted(() => ({
  fetchNodeStatus: vi.fn(),
}));

const socketMocks = vi.hoisted(() => ({
  connect: vi.fn(),
  subscribeToNodes: vi.fn(),
  onNodeStatus: vi.fn(),
  onNodeState: vi.fn(),
  onConnected: vi.fn(),
  onReconnected: vi.fn(),
  onDisconnected: vi.fn(),
  isConnected: vi.fn(),
}));

const handlerStore = vi.hoisted(() => ({
  connected: [] as Array<() => void>,
  reconnected: [] as Array<() => void>,
  disconnected: [] as Array<() => void>,
  status: { current: undefined as ((event: any) => void) | undefined },
}));

const applySocketHandlers = () => {
  socketMocks.onNodeStatus.mockImplementation((nodeId: string, handler: (event: any) => void) => {
    handlerStore.status.current = handler;
    return () => {
      if (handlerStore.status.current === handler) {
        handlerStore.status.current = undefined;
      }
    };
  });
  socketMocks.onNodeState.mockImplementation(() => () => {});
  socketMocks.onConnected.mockImplementation((handler: () => void) => {
    handlerStore.connected.push(handler);
    return () => {
      const idx = handlerStore.connected.indexOf(handler);
      if (idx >= 0) handlerStore.connected.splice(idx, 1);
    };
  });
  socketMocks.onReconnected.mockImplementation((handler: () => void) => {
    handlerStore.reconnected.push(handler);
    return () => {
      const idx = handlerStore.reconnected.indexOf(handler);
      if (idx >= 0) handlerStore.reconnected.splice(idx, 1);
    };
  });
  socketMocks.onDisconnected.mockImplementation((handler: () => void) => {
    handlerStore.disconnected.push(handler);
    return () => {
      const idx = handlerStore.disconnected.indexOf(handler);
      if (idx >= 0) handlerStore.disconnected.splice(idx, 1);
    };
  });
};

vi.mock('../../services/api', () => ({
  graphApiService: {
    fetchNodeStatus: apiMocks.fetchNodeStatus,
  },
}));

vi.mock('../../services/socket', () => {
  applySocketHandlers();

  return {
    graphSocketService: {
      connect: socketMocks.connect,
      subscribeToNodes: socketMocks.subscribeToNodes,
      onNodeStatus: socketMocks.onNodeStatus,
      onNodeState: socketMocks.onNodeState,
      onConnected: socketMocks.onConnected,
      onReconnected: socketMocks.onReconnected,
      onDisconnected: socketMocks.onDisconnected,
      isConnected: socketMocks.isConnected,
    },
  };
});

let useNodeStatus: UseNodeStatusFn;

beforeAll(async () => {
  ({ useNodeStatus } = await import('../useNodeStatus'));
});

function createClientWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { wrapper, queryClient };
}

describe('useNodeStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    apiMocks.fetchNodeStatus.mockResolvedValue({ provisionStatus: { state: 'not_ready' } });
    socketMocks.connect.mockClear();
    socketMocks.subscribeToNodes.mockClear();
    apiMocks.fetchNodeStatus.mockClear();
    socketMocks.onNodeStatus.mockClear();
    socketMocks.onNodeState.mockClear();
    socketMocks.onConnected.mockClear();
    socketMocks.onReconnected.mockClear();
    socketMocks.onDisconnected.mockClear();
    applySocketHandlers();
    handlerStore.connected.length = 0;
    handlerStore.reconnected.length = 0;
    handlerStore.disconnected.length = 0;
    handlerStore.status.current = undefined;
    socketMocks.isConnected.mockReturnValue(false);
    socketMocks.subscribeToNodes.mockReturnValue(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('backs off polling when socket disconnects', async () => {
    const { wrapper, queryClient } = createClientWrapper();
    const { result, unmount } = renderHook(() => useNodeStatus('node-1'), { wrapper });

    await act(async () => {
      await Promise.resolve();
    });
    expect(apiMocks.fetchNodeStatus).toHaveBeenCalledTimes(1);
    expect(socketMocks.subscribeToNodes).toHaveBeenCalledWith(['node-1']);
    expect(typeof handlerStore.status.current).toBe('function');

    act(() => {
      handlerStore.status.current?.({ nodeId: 'node-1', updatedAt: new Date().toISOString(), provisionStatus: { state: 'ready' } });
    });
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(queryClient.getQueryData(['graph', 'node', 'node-1', 'status'])).toMatchObject({ provisionStatus: { state: 'ready' } });
    expect(result.current.data?.provisionStatus?.state).toBe('ready');

    expect(handlerStore.disconnected.length).toBeGreaterThan(0);

    act(() => {
      handlerStore.disconnected.forEach((handler) => handler());
    });

    await vi.advanceTimersByTimeAsync(5000);
    await act(async () => {
      await Promise.resolve();
    });
    expect(apiMocks.fetchNodeStatus).toHaveBeenCalledTimes(2);

    act(() => {
      handlerStore.disconnected.forEach((handler) => handler());
    });

    await vi.advanceTimersByTimeAsync(10000);
    await act(async () => {
      await Promise.resolve();
    });
    expect(apiMocks.fetchNodeStatus).toHaveBeenCalledTimes(3);

    act(() => {
      handlerStore.connected.forEach((handler) => handler());
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(apiMocks.fetchNodeStatus).toHaveBeenCalledTimes(3);

    act(() => {
      handlerStore.reconnected.forEach((handler) => handler());
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(apiMocks.fetchNodeStatus).toHaveBeenCalledTimes(4);

    unmount();
  });
});
