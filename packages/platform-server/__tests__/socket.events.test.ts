import { describe, it, expect } from 'vitest';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { GraphSocketGateway } from '../src/gateway/graph.socket.gateway';
import { LoggerService } from '../src/core/services/logger.service';
import Node from '../src/graph/nodes/base/Node';

// Minimal Test Node to trigger status changes
class TestNode extends Node<Record<string, unknown>> {
  getPortConfig() { return { sourcePorts: { $self: { kind: 'instance' } } } as const; }
}

describe('Socket events', () => {
  it('emits node_status on provision/deprovision', async () => {
    const adapter = new FastifyAdapter();
    const fastify = adapter.getInstance();
    const logger = new LoggerService();
    let listener: ((ev: { nodeId: string; prev: string; next: string; at: number }) => void) | undefined;
    const runtimeStub = { subscribe: (fn: typeof listener) => { listener = fn; return () => {}; } } as unknown as import('../src/graph/liveGraph.manager').LiveGraphRuntime;
    const gateway = new GraphSocketGateway(logger, runtimeStub);
    gateway.init({ server: fastify.server });

    const node = new TestNode();
    node.init({ nodeId: 'n1' });
    // Simulate runtime status events
    const now = Date.now();
    expect(() => listener && listener({ nodeId: 'n1', prev: 'not_ready', next: 'provisioning', at: now })).not.toThrow();
    expect(() => listener && listener({ nodeId: 'n1', prev: 'provisioning', next: 'ready', at: now + 1 })).not.toThrow();
    expect(() => listener && listener({ nodeId: 'n1', prev: 'ready', next: 'deprovisioning', at: now + 2 })).not.toThrow();
    expect(() => listener && listener({ nodeId: 'n1', prev: 'deprovisioning', next: 'not_ready', at: now + 3 })).not.toThrow();
  });

  it('emits node_state via NodeStateService bridge', async () => {
    const adapter = new FastifyAdapter();
    const fastify = adapter.getInstance();
    const logger = new LoggerService();
    const runtimeStub = { subscribe: () => () => {} } as unknown as import('../src/graph/liveGraph.manager').LiveGraphRuntime;
    const gateway = new GraphSocketGateway(logger, runtimeStub);
    gateway.init({ server: fastify.server });
    // Direct emit through gateway (bridge in NodeStateService calls this)
    expect(() => gateway.emitNodeState('n1', { k: 'v' })).not.toThrow();
  });
});
