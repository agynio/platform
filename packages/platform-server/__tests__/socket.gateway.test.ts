import { describe, it, expect } from 'vitest';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { GraphSocketGateway } from '../src/gateway/graph.socket.gateway';
import { PrismaService } from '../src/core/services/prisma.service';
import { ThreadsMetricsService } from '../src/agents/threads.metrics.service';

describe('GraphSocketGateway', () => {
  it('gateway initializes without errors', async () => {
    const adapter = new FastifyAdapter();
    const fastify = adapter.getInstance();
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
    const gateway = new GraphSocketGateway(runtimeStub, metrics, prismaStub, eventsBusStub as any);
    expect(() => gateway.init({ server: fastify.server })).not.toThrow();
  });
});
