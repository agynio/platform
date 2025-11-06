import { describe, it, expect } from 'vitest';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { GraphSocketGateway } from '../src/gateway/graph.socket.gateway';
import { LoggerService } from '../src/core/services/logger.service';

describe('GraphSocketGateway', () => {
  it('gateway initializes without errors', async () => {
    const adapter = new FastifyAdapter();
    const fastify = adapter.getInstance();
    const logger = new LoggerService();
    const runtimeStub = { subscribe: () => () => {} } as unknown as import('../src/graph/liveGraph.manager').LiveGraphRuntime;
    const gateway = new GraphSocketGateway(logger, runtimeStub);
    expect(() => gateway.init({ server: fastify.server })).not.toThrow();
  });
});
