import { describe, expect, it, vi } from 'vitest';
import { SlackTrigger } from '../src/nodes/slackTrigger/slackTrigger.node';
import { RemindMeNode } from '../src/nodes/tools/remind_me/remind_me.node';
import { LoggerService } from '../src/core/services/logger.service';
import { VaultService } from '../src/vault/vault.service';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { PrismaService } from '../src/core/services/prisma.service';
import { SlackAdapter } from '../src/messaging/slack/slack.adapter';
import { EventsBusService } from '../src/events/events-bus.service';

process.env.LLM_PROVIDER = process.env.LLM_PROVIDER || 'openai';
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

const loggerStub = makeStub({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(),
});

const slackAdapterStub = makeStub({
  sendText: vi.fn(),
});

const vaultServiceStub = makeStub({
  getSecret: vi.fn().mockResolvedValue('xoxb-test-token'),
});

const persistenceStub = makeStub({
  getOrCreateThreadByAlias: vi.fn().mockResolvedValue('thread-123'),
  updateThreadChannelDescriptor: vi.fn().mockResolvedValue(undefined),
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
        loggerStub as unknown as LoggerService,
        vaultServiceStub as unknown as VaultService,
        persistenceStub as unknown as AgentsPersistenceService,
        prismaStub as unknown as PrismaService,
        slackAdapterStub as unknown as SlackAdapter,
      );
      expect(slackTrigger).toBeInstanceOf(SlackTrigger);

      const remindMeNode = new RemindMeNode(
        loggerStub as unknown as LoggerService,
        eventsBusStub as unknown as EventsBusService,
        prismaStub as unknown as PrismaService,
      );
      expect(remindMeNode).toBeInstanceOf(RemindMeNode);
    });
  });
}
