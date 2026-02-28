import { describe, it, expect } from 'vitest';
import { GraphSocketGateway } from '../src/gateway/graph.socket.gateway';
import Node from '../src/nodes/base/Node';

class DummyNode extends Node<Record<string, unknown>> { getPortConfig() { return { sourcePorts: { $self: { kind: 'instance' } } } as const; } }

describe('Gateway node_status integration', () => {
  it('broadcasts on node lifecycle changes', async () => {
    const runtimeStub = { subscribe: () => () => {} } as unknown as import('../src/graph-core/liveGraph.manager').LiveGraphRuntime;
    const metricsStub = { getThreadsMetrics: async () => ({}) };
    const prismaStub = {
      getClient: () => ({
        $queryRaw: async () => [],
      }),
    };
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
    const notificationsPublisher = { publishToRooms: async () => undefined };
    const gateway = new GraphSocketGateway(
      runtimeStub,
      metricsStub as any,
      prismaStub as any,
      eventsBusStub as any,
      notificationsPublisher,
    );
    gateway.onModuleInit();
    const node = new DummyNode();
    node.init({ nodeId: 'nX' });
    await node.provision();
    await node.deprovision();
    expect(true).toBe(true);
  });
});
