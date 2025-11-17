import { describe, it, expect, vi } from 'vitest';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { GraphSocketGateway } from '../src/gateway/graph.socket.gateway';
import { LoggerService } from '../src/core/services/logger.service';
import { PrismaService } from '../src/core/services/prisma.service';
import { ThreadsMetricsService } from '../src/agents/threads.metrics.service';
import { RunEventsService } from '../src/events/run-events.service';

describe('GraphSocketGateway', () => {
  it('gateway initializes without errors', async () => {
    const adapter = new FastifyAdapter();
    const fastify = adapter.getInstance();
    const logger = new LoggerService();
    const runtimeStub = { subscribe: () => () => {} } as unknown as import('../src/graph/liveGraph.manager').LiveGraphRuntime;
    const prismaStub = { getClient: () => ({ $queryRaw: async () => [] }) } as unknown as PrismaService;
    const metrics = new ThreadsMetricsService(prismaStub as any, logger);
    const gateway = new GraphSocketGateway(logger, runtimeStub, metrics, prismaStub);
    expect(() => gateway.init({ server: fastify.server })).not.toThrow();
  });

  it('binds run events service to socket publisher when provided', () => {
    const logger = new LoggerService();
    const runtimeStub = { subscribe: () => () => {} } as unknown as import('../src/graph/liveGraph.manager').LiveGraphRuntime;
    const prismaStub = { getClient: () => ({ $queryRaw: async () => [] }) } as unknown as PrismaService;
    const metrics = new ThreadsMetricsService(prismaStub as any, logger);
    const runEvents = { setEventsPublisher: vi.fn() } as unknown as RunEventsService;

    const gateway = new GraphSocketGateway(logger, runtimeStub, metrics, prismaStub, undefined, runEvents);

    expect(runEvents.setEventsPublisher).toHaveBeenCalledTimes(1);
    expect(runEvents.setEventsPublisher).toHaveBeenCalledWith(gateway);
  });
});
