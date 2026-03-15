import { describe, expect, it, vi } from 'vitest';
import { RemindMeNode } from '../src/nodes/tools/remind_me/remind_me.node';
import { PrismaService } from '../src/core/services/prisma.service';
import { EventsBusService } from '../src/events/events-bus.service';

process.env.LLM_PROVIDER = process.env.LLM_PROVIDER || 'litellm';
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
    it('constructs RemindMeNode with stubs', () => {
      const remindMeNode = new RemindMeNode(
        eventsBusStub as unknown as EventsBusService,
        prismaStub as unknown as PrismaService,
      );
      expect(remindMeNode).toBeInstanceOf(RemindMeNode);
    });
  });
}
