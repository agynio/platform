import { describe, it, expect, vi } from 'vitest';
import { createServer } from 'http';
import { GraphSocketGateway } from '../src/gateway/graph.socket.gateway';
import { PrismaService } from '../src/core/services/prisma.service';
import { ThreadsMetricsService } from '../src/agents/threads.metrics.service';
import Node from '../src/nodes/base/Node';

// Minimal Test Node to trigger status changes
class TestNode extends Node<Record<string, unknown>> {
  getPortConfig() { return { sourcePorts: { $self: { kind: 'instance' } } } as const; }
}

describe('Socket events', () => {
  it('publishes node_status on provision/deprovision', async () => {
    let listener: ((ev: { nodeId: string; prev: string; next: string; at: number }) => void) | undefined;
    const runtimeStub = { subscribe: (fn: typeof listener) => { listener = fn; return () => {}; } } as unknown as import('../src/graph-core/liveGraph.manager').LiveGraphRuntime;
    const prismaStub = { getClient: () => ({ $queryRaw: async () => [] }) } as unknown as PrismaService;
    const metrics = new ThreadsMetricsService(prismaStub as any);
    const eventsBusStub = {
      subscribeToRunEvents: () => () => {},
      subscribeToToolOutputChunk: () => () => {},
      subscribeToToolOutputTerminal: () => () => {},
      subscribeToReminderCount: () => () => {},
      subscribeToNodeState: () => () => {},
      subscribeToThreadCreated: () => () => {},
      subscribeToThreadUpdated: () => () => {},
      subscribeToMessageCreated: () => () => {},
      subscribeToRunStatusChanged: () => () => {},
      subscribeToThreadMetrics: () => () => {},
      subscribeToThreadMetricsAncestors: () => () => {},
    };
    const notificationsPublisher = { publishToRooms: vi.fn().mockResolvedValue(undefined) };
    const gateway = new GraphSocketGateway(runtimeStub, metrics, prismaStub, eventsBusStub as any, notificationsPublisher);
    const server = createServer();
    gateway.onModuleInit();
    gateway.init({ server });

    const node = new TestNode();
    node.init({ nodeId: 'n1' });
    // Simulate runtime status events
    const now = Date.now();
    listener?.({ nodeId: 'n1', prev: 'not_ready', next: 'provisioning', at: now });
    listener?.({ nodeId: 'n1', prev: 'provisioning', next: 'ready', at: now + 1 });
    listener?.({ nodeId: 'n1', prev: 'ready', next: 'deprovisioning', at: now + 2 });
    listener?.({ nodeId: 'n1', prev: 'deprovisioning', next: 'not_ready', at: now + 3 });

    const calls = notificationsPublisher.publishToRooms.mock.calls.filter((call) => call[0].event === 'node_status');
    expect(calls).toHaveLength(4);
    for (const call of calls) {
      const [{ rooms, payload }] = call;
      expect(rooms).toEqual(expect.arrayContaining(['graph', 'node:n1']));
      expect(payload).toMatchObject({ nodeId: 'n1' });
    }
    server.close();
  });

  it('publishes node_state via NodeStateService bridge', async () => {
    const runtimeStub = { subscribe: () => () => {} } as unknown as import('../src/graph-core/liveGraph.manager').LiveGraphRuntime;
    const prismaStub = { getClient: () => ({ $queryRaw: async () => [] }) } as unknown as PrismaService;
    const metrics = new ThreadsMetricsService(prismaStub as any);
    const eventsBusStub = {
      subscribeToRunEvents: () => () => {},
      subscribeToToolOutputChunk: () => () => {},
      subscribeToToolOutputTerminal: () => () => {},
      subscribeToReminderCount: () => () => {},
      subscribeToNodeState: () => () => {},
      subscribeToThreadCreated: () => () => {},
      subscribeToThreadUpdated: () => () => {},
      subscribeToMessageCreated: () => () => {},
      subscribeToRunStatusChanged: () => () => {},
      subscribeToThreadMetrics: () => () => {},
      subscribeToThreadMetricsAncestors: () => () => {},
    };
    const notificationsPublisher = { publishToRooms: vi.fn().mockResolvedValue(undefined) };
    const gateway = new GraphSocketGateway(runtimeStub, metrics, prismaStub, eventsBusStub as any, notificationsPublisher);
    gateway.onModuleInit();
    gateway.emitNodeState('n1', { k: 'v' });
    expect(notificationsPublisher.publishToRooms).toHaveBeenCalledWith(
      expect.objectContaining({
        rooms: expect.arrayContaining(['graph', 'node:n1']),
        event: 'node_state',
        payload: expect.objectContaining({ nodeId: 'n1', state: { k: 'v' } }),
      }),
    );
  });

  it('publishes reminder count to graph and node rooms', async () => {
    const runtimeStub = { subscribe: () => () => {} } as unknown as import('../src/graph-core/liveGraph.manager').LiveGraphRuntime;
    const prismaStub = { getClient: () => ({ $queryRaw: async () => [] }) } as unknown as PrismaService;
    const metrics = new ThreadsMetricsService(prismaStub as any);
    const eventsBusStub = {
      subscribeToRunEvents: () => () => {},
      subscribeToToolOutputChunk: () => () => {},
      subscribeToToolOutputTerminal: () => () => {},
      subscribeToReminderCount: () => () => {},
      subscribeToNodeState: () => () => {},
      subscribeToThreadCreated: () => () => {},
      subscribeToThreadUpdated: () => () => {},
      subscribeToMessageCreated: () => () => {},
      subscribeToRunStatusChanged: () => () => {},
      subscribeToThreadMetrics: () => () => {},
      subscribeToThreadMetricsAncestors: () => () => {},
    };
    const notificationsPublisher = { publishToRooms: vi.fn().mockResolvedValue(undefined) };
    const gateway = new GraphSocketGateway(runtimeStub, metrics, prismaStub, eventsBusStub as any, notificationsPublisher);
    gateway.onModuleInit();
    gateway.emitReminderCount('n1', 3, Date.now());
    expect(notificationsPublisher.publishToRooms).toHaveBeenCalledWith(
      expect.objectContaining({
        rooms: expect.arrayContaining(['graph', 'node:n1']),
        event: 'node_reminder_count',
        payload: expect.objectContaining({ nodeId: 'n1', count: 3 }),
      }),
    );
  });
});
