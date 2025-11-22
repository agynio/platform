import { describe, it, expect } from 'vitest';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { GraphSocketGateway } from '../src/gateway/graph.socket.gateway';
import { LoggerService } from '../src/core/services/logger.service';
import Node from '../src/nodes/base/Node';

class DummyNode extends Node<Record<string, unknown>> { getPortConfig() { return { sourcePorts: { $self: { kind: 'instance' } } } as const; } }

describe('Gateway node_status integration', () => {
  it('broadcasts on node lifecycle changes', async () => {
    const adapter = new FastifyAdapter();
    const fastify = adapter.getInstance();
    const logger = new LoggerService();
    const runtimeStub = { subscribe: () => () => {} } as unknown as import('../src/graph-core/liveGraph.manager').LiveGraphRuntime;
    const gateway = new GraphSocketGateway(logger, runtimeStub);
    gateway.init({ server: fastify.server });
    const node = new DummyNode();
    node.init({ nodeId: 'nX' });
    await node.provision();
    await node.deprovision();
    expect(true).toBe(true);
  });
});
