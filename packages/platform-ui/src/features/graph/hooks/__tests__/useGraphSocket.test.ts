import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import type { useGraphSocket as UseGraphSocketFn } from '../useGraphSocket';
import { act, renderHook } from '@testing-library/react';

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
  status: new Map<string, (event: any) => void>(),
  state: new Map<string, (event: any) => void>(),
}));

const applySocketHandlers = () => {
  socketMocks.onNodeStatus.mockImplementation((nodeId: string, handler: (event: any) => void) => {
    handlerStore.status.set(nodeId, handler);
    return () => {
      handlerStore.status.delete(nodeId);
    };
  });
  socketMocks.onNodeState.mockImplementation((nodeId: string, handler: (event: any) => void) => {
    handlerStore.state.set(nodeId, handler);
    return () => {
      handlerStore.state.delete(nodeId);
    };
  });
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
    __mockHandlers: handlerStore,
  };
});
let useGraphSocket: UseGraphSocketFn;
let graphServiceModule: { graphSocketService: { connect: typeof socketMocks.connect } };

beforeAll(async () => {
  graphServiceModule = await import('../../services/socket');
  ({ useGraphSocket } = await import('../useGraphSocket'));
});

describe('useGraphSocket', () => {
  beforeEach(() => {
    socketMocks.connect.mockClear();
    socketMocks.subscribeToNodes.mockClear();
    socketMocks.onNodeStatus.mockClear();
    socketMocks.onNodeState.mockClear();
    socketMocks.onConnected.mockClear();
    socketMocks.onReconnected.mockClear();
    socketMocks.onDisconnected.mockClear();
    applySocketHandlers();
    socketMocks.isConnected.mockReturnValue(false);
    handlerStore.connected.length = 0;
    handlerStore.reconnected.length = 0;
    handlerStore.disconnected.length = 0;
    handlerStore.status.clear();
    handlerStore.state.clear();
    socketMocks.subscribeToNodes.mockReturnValue(() => {});
  });

  it('subscribes to nodes and resubscribes on reconnect', async () => {
    const statusSpy = vi.fn();
    const stateSpy = vi.fn();
    const subscribeCleanup = vi.fn();
    socketMocks.subscribeToNodes.mockReturnValue(subscribeCleanup);

    const { unmount } = renderHook(() =>
      useGraphSocket({
        nodeIds: ['beta', 'alpha'],
        onStatus: statusSpy,
        onState: stateSpy,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(graphServiceModule.graphSocketService.connect).toBe(socketMocks.connect);
    expect(socketMocks.connect).toHaveBeenCalled();
    expect(socketMocks.subscribeToNodes).toHaveBeenCalledWith(['alpha', 'beta']);
    expect(socketMocks.onNodeStatus).toHaveBeenCalledTimes(2);
    expect(socketMocks.onNodeState).toHaveBeenCalledTimes(2);

    const statusHandler = handlerStore.status.get('alpha');
    expect(statusHandler).toBeDefined();
    act(() => {
      statusHandler?.({ nodeId: 'alpha', updatedAt: new Date().toISOString(), provisionStatus: { state: 'ready' } });
    });
    expect(statusSpy).toHaveBeenCalledWith({ nodeId: 'alpha', updatedAt: expect.any(String), provisionStatus: { state: 'ready' } });

    const stateHandler = handlerStore.state.get('alpha');
    expect(stateHandler).toBeDefined();
    act(() => {
      stateHandler?.({ nodeId: 'alpha', state: { foo: 'bar' }, updatedAt: new Date().toISOString() });
    });
    expect(stateSpy).toHaveBeenCalledWith({ nodeId: 'alpha', state: { foo: 'bar' }, updatedAt: expect.any(String) });

    expect(handlerStore.reconnected.length).toBeGreaterThan(0);
    const callsBeforeReconnect = socketMocks.subscribeToNodes.mock.calls.length;
    act(() => {
      handlerStore.reconnected.forEach((handler) => handler());
    });
    expect(socketMocks.subscribeToNodes.mock.calls.length).toBeGreaterThan(callsBeforeReconnect);

    unmount();
    expect(subscribeCleanup).toHaveBeenCalled();
  });
});
