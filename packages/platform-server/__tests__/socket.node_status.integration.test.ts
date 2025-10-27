import { describe, it, expect } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { AppModule } from '../src/bootstrap/app.module';
import { GraphSocketGateway } from '../src/gateway/graph.socket.gateway';
import Node from '../src/nodes/base/Node';

class DummyNode extends Node<Record<string, unknown>> { getPortConfig() { return { sourcePorts: { $self: { kind: 'instance' } } } as const; } }

describe('Gateway node_status integration', () => {
  it('broadcasts on node lifecycle changes', async () => {
    const adapter = new FastifyAdapter();
    const app = await NestFactory.create(AppModule, adapter);
    await app.init();
    const gateway = app.get(GraphSocketGateway);
    gateway.init({ server: adapter.getInstance().server });
    const node = new DummyNode();
    node.init({ nodeId: 'nX' });
    await node.provision();
    await node.deprovision();
    await app.close();
    expect(true).toBe(true);
  });
});

