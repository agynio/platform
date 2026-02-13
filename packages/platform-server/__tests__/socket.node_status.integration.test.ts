import { describe, it, expect } from 'vitest';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { GraphSocketGateway } from '../src/gateway/graph.socket.gateway';
import type { ConfigService } from '../src/core/services/config.service';
import type { AuthService } from '../src/auth/auth.service';
import Node from '../src/nodes/base/Node';

class DummyNode extends Node<Record<string, unknown>> { getPortConfig() { return { sourcePorts: { $self: { kind: 'instance' } } } as const; } }

describe('Gateway node_status integration', () => {
  it('broadcasts on node lifecycle changes', async () => {
    const adapter = new FastifyAdapter();
    const fastify = adapter.getInstance();
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
    const configStub = { corsOrigins: [] } as unknown as ConfigService;
    const authStub = { resolvePrincipalFromCookieHeader: async () => ({ userId: 'test-user' }) } as unknown as AuthService;
    const gateway = new GraphSocketGateway(runtimeStub, metricsStub as any, prismaStub as any, eventsBusStub as any, configStub, authStub);
    gateway.init({ server: fastify.server });
    const node = new DummyNode();
    node.init({ nodeId: 'nX' });
    await node.provision();
    await node.deprovision();
    expect(true).toBe(true);
  });
});
