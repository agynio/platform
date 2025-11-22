import { describe, it, expect } from 'vitest';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { GraphSocketGateway } from '../src/gateway/graph.socket.gateway';
import { LoggerService } from '../src/core/services/logger.service';
import { PrismaService } from '../src/core/services/prisma.service';
import { ThreadsMetricsService } from '../src/agents/threads.metrics.service';

describe('GraphSocketGateway', () => {
  it('gateway initializes without errors', async () => {
    const adapter = new FastifyAdapter();
    const fastify = adapter.getInstance();
    const logger = new LoggerService();
    const runtimeStub = { subscribe: () => () => {} } as unknown as import('../src/graph-core/liveGraph.manager').LiveGraphRuntime;
    const prismaStub = { getClient: () => ({ $queryRaw: async () => [] }) } as unknown as PrismaService;
    const metrics = new ThreadsMetricsService(prismaStub as any, logger);
    const gateway = new GraphSocketGateway(logger, runtimeStub, metrics, prismaStub);
    expect(() => gateway.init({ server: fastify.server })).not.toThrow();
  });
});
