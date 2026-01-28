import { describe, it, expect, vi } from 'vitest';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { GraphSocketGateway } from '../src/gateway/graph.socket.gateway';
import { PrismaService } from '../src/core/services/prisma.service';
import { ThreadsMetricsService } from '../src/agents/threads.metrics.service';
import type { ConfigService } from '../src/core/services/config.service';
import type { AuthService } from '../src/auth/auth.service';
import Node from '../src/nodes/base/Node';

// Minimal Test Node to trigger status changes
class TestNode extends Node<Record<string, unknown>> {
  getPortConfig() { return { sourcePorts: { $self: { kind: 'instance' } } } as const; }
}

describe('Socket events', () => {
  it('emits node_status on provision/deprovision', async () => {
    const adapter = new FastifyAdapter();
    const fastify = adapter.getInstance();
    let listener: ((ev: { nodeId: string; prev: string; next: string; at: number }) => void) | undefined;
    const runtimeStub = { subscribe: (fn: typeof listener) => { listener = fn; return () => {}; } } as unknown as import('../src/graph-core/liveGraph.manager').LiveGraphRuntime;
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
    const configStub = { corsOrigins: [] } as unknown as ConfigService;
    const authStub = { resolvePrincipalFromCookieHeader: async () => ({ userId: 'test-user' }) } as unknown as AuthService;
    const gateway = new GraphSocketGateway(runtimeStub, metrics, prismaStub, eventsBusStub as any, configStub, authStub);
    gateway.init({ server: fastify.server });

    const emitMap = new Map<string, ReturnType<typeof vi.fn>>();
    const toSpy = vi.fn((room: string) => {
      if (!emitMap.has(room)) emitMap.set(room, vi.fn());
      return { emit: emitMap.get(room)! };
    });
    (gateway as any).io = { to: toSpy };

    const node = new TestNode();
    node.init({ nodeId: 'n1' });
    // Simulate runtime status events
    const now = Date.now();
    listener?.({ nodeId: 'n1', prev: 'not_ready', next: 'provisioning', at: now });
    listener?.({ nodeId: 'n1', prev: 'provisioning', next: 'ready', at: now + 1 });
    listener?.({ nodeId: 'n1', prev: 'ready', next: 'deprovisioning', at: now + 2 });
    listener?.({ nodeId: 'n1', prev: 'deprovisioning', next: 'not_ready', at: now + 3 });

    expect(toSpy).toHaveBeenCalledWith('graph');
    expect(toSpy).toHaveBeenCalledWith('node:n1');
    const graphEmitter = emitMap.get('graph');
    const nodeEmitter = emitMap.get('node:n1');
    expect(graphEmitter).toBeTruthy();
    expect(nodeEmitter).toBeTruthy();
    expect(graphEmitter).toHaveBeenCalledTimes(4);
    expect(nodeEmitter).toHaveBeenCalledTimes(4);
    const payload = graphEmitter?.mock.calls[0]?.[1];
    expect(payload).toMatchObject({ nodeId: 'n1', provisionStatus: { state: 'provisioning' } });
  });

  it('emits node_state via NodeStateService bridge', async () => {
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
    const configStub = { corsOrigins: [] } as unknown as ConfigService;
    const authStub = { resolvePrincipalFromCookieHeader: async () => ({ userId: 'test-user' }) } as unknown as AuthService;
    const gateway = new GraphSocketGateway(runtimeStub, metrics, prismaStub, eventsBusStub as any, configStub, authStub);
    gateway.init({ server: fastify.server });
    const emitMap = new Map<string, ReturnType<typeof vi.fn>>();
    const toSpy = vi.fn((room: string) => {
      if (!emitMap.has(room)) emitMap.set(room, vi.fn());
      return { emit: emitMap.get(room)! };
    });
    (gateway as any).io = { to: toSpy };
    gateway.emitNodeState('n1', { k: 'v' });
    expect(toSpy).toHaveBeenCalledWith('graph');
    expect(toSpy).toHaveBeenCalledWith('node:n1');
    expect(emitMap.get('graph')).toHaveBeenCalledWith('node_state', expect.objectContaining({ nodeId: 'n1', state: { k: 'v' } }));
    expect(emitMap.get('node:n1')).toHaveBeenCalledWith('node_state', expect.objectContaining({ nodeId: 'n1', state: { k: 'v' } }));
  });

  it('emits reminder count to graph and node rooms', async () => {
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
    const configStub = { corsOrigins: [] } as unknown as ConfigService;
    const authStub = { resolvePrincipalFromCookieHeader: async () => ({ userId: 'test-user' }) } as unknown as AuthService;
    const gateway = new GraphSocketGateway(runtimeStub, metrics, prismaStub, eventsBusStub as any, configStub, authStub);
    gateway.init({ server: fastify.server });
    const emitMap = new Map<string, ReturnType<typeof vi.fn>>();
    const toSpy = vi.fn((room: string) => {
      if (!emitMap.has(room)) emitMap.set(room, vi.fn());
      return { emit: emitMap.get(room)! };
    });
    (gateway as any).io = { to: toSpy };
    gateway.emitReminderCount('n1', 3, Date.now());
    expect(toSpy).toHaveBeenCalledWith('graph');
    expect(toSpy).toHaveBeenCalledWith('node:n1');
    expect(emitMap.get('graph')).toHaveBeenCalledWith('node_reminder_count', expect.objectContaining({ nodeId: 'n1', count: 3 }));
    expect(emitMap.get('node:n1')).toHaveBeenCalledWith('node_reminder_count', expect.objectContaining({ nodeId: 'n1', count: 3 }));
  });
});
