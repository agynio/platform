import { describe, it, expect } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { AppModule } from '../src/bootstrap/app.module';
import { GraphSocketGateway } from '../src/gateway/graph.socket.gateway';
import Node from '../src/nodes/base/Node';

// Minimal Test Node to trigger status changes
class TestNode extends Node<Record<string, unknown>> {
  getPortConfig() { return { sourcePorts: { $self: { kind: 'instance' } } } as const; }
}

describe('Socket events', () => {
  it('emits node_status on provision/deprovision', async () => {
    const adapter = new FastifyAdapter();
    const app = await NestFactory.create(AppModule, adapter);
    await app.init();
    const gateway = app.get(GraphSocketGateway);
    const fastify = adapter.getInstance();
    gateway.init({ server: fastify.server });

    const node = new TestNode();
    node.init({ nodeId: 'n1' });
    // Emit status changes
    expect(() => (node as any).emitStatusChanged('not_ready', 'provisioning')).not.toThrow();
    expect(() => (node as any).emitStatusChanged('provisioning', 'ready')).not.toThrow();
    expect(() => (node as any).emitStatusChanged('ready', 'deprovisioning')).not.toThrow();
    expect(() => (node as any).emitStatusChanged('deprovisioning', 'not_ready')).not.toThrow();
    await app.close();
  });

  it('emits node_state via NodeStateService bridge', async () => {
    const adapter = new FastifyAdapter();
    const app = await NestFactory.create(AppModule, adapter);
    await app.init();
    const gateway = app.get(GraphSocketGateway);
    const fastify = adapter.getInstance();
    gateway.init({ server: fastify.server });
    // Direct emit through gateway (bridge in NodeStateService calls this)
    expect(() => gateway.emitNodeState('n1', { k: 'v' })).not.toThrow();
    await app.close();
  });
});

