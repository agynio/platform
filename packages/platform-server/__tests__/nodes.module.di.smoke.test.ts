import { describe, expect, it, vi } from 'vitest';
import { SlackTrigger } from '../src/nodes/slackTrigger/slackTrigger.node';
import { RemindMeNode } from '../src/nodes/tools/remind_me/remind_me.node';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { PrismaService } from '../src/core/services/prisma.service';
import { SlackAdapter } from '../src/messaging/slack/slack.adapter';
import { EventsBusService } from '../src/events/events-bus.service';
import { createReferenceResolverStub } from './helpers/reference-resolver.stub';

process.env.AGENTS_DATABASE_URL = process.env.AGENTS_DATABASE_URL || 'postgres://localhost:5432/test';

const shouldRunDbTests = process.env.RUN_DB_TESTS === 'true';

const makeStub = <T extends Record<string, unknown>>(overrides: T): T =>
  new Proxy(overrides, {
    get(target, prop: string, receiver) {
      if (prop in target) return Reflect.get(target, prop, receiver);
      const fn = vi.fn();
      Reflect.set(target, prop, fn);
      return fn;
    },
  });

const slackAdapterStub = makeStub({
  sendText: vi.fn(),
});

const persistenceStub = makeStub({
  getOrCreateThreadByAlias: vi.fn().mockResolvedValue('thread-123'),
  updateThreadChannelDescriptor: vi.fn().mockResolvedValue(undefined),
  ensureAssignedAgent: vi.fn().mockResolvedValue(undefined),
});

const prismaClientStub = makeStub({
  $transaction: vi.fn(async (cb: (tx: Record<string, unknown>) => Promise<unknown>) => cb({})),
});

const prismaStub = makeStub({
  $on: vi.fn(),
  $use: vi.fn(),
  $transaction: vi.fn(async (cb: (tx: typeof prismaClientStub) => Promise<unknown>) => cb(prismaClientStub)),
  $connect: vi.fn(),
  $disconnect: vi.fn(),
  getClient: vi.fn().mockReturnValue(prismaClientStub),
});

const eventsBusStub = makeStub({
  publishEvent: vi.fn().mockResolvedValue(null),
  subscribeToRunEvents: vi.fn(() => vi.fn()),
  subscribeToToolOutputChunk: vi.fn(() => vi.fn()),
  subscribeToToolOutputTerminal: vi.fn(() => vi.fn()),
  emitReminderCount: vi.fn(),
});

const runtimeStub = makeStub({
  getOutboundNodeIds: vi.fn(() => []),
  getNodes: vi.fn(() => []),
});

const templateRegistryStub = makeStub({
  getMeta: vi.fn(() => undefined),
});

if (!shouldRunDbTests) {
  describe.skip('NodesModule DI smoke test', () => {
    it('skipped because RUN_DB_TESTS is not true', () => {
      expect(true).toBe(true);
    });
  });
} else {
  describe('NodesModule DI smoke test', () => {
    it('constructs SlackTrigger and RemindMeNode with stubs', () => {
      const slackTrigger = new SlackTrigger(
        createReferenceResolverStub().stub,
        persistenceStub as unknown as AgentsPersistenceService,
        prismaStub as unknown as PrismaService,
        slackAdapterStub as unknown as SlackAdapter,
        runtimeStub as unknown as import('../src/graph-core/liveGraph.manager').LiveGraphRuntime,
        templateRegistryStub as unknown as import('../src/graph-core/templateRegistry').TemplateRegistry,
      );
      expect(slackTrigger).toBeInstanceOf(SlackTrigger);

      const remindMeNode = new RemindMeNode(
        eventsBusStub as unknown as EventsBusService,
        prismaStub as unknown as PrismaService,
      );
      expect(remindMeNode).toBeInstanceOf(RemindMeNode);
    });
  });
}
