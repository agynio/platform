import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RemindersService } from '../src/agents/reminders.service';
import { RemindMeNode } from '../src/nodes/tools/remind_me/remind_me.node';

type RuntimeNode = { id: string; template?: string; instance: unknown };

const createRuntimeFixture = (...nodes: RuntimeNode[]) => ({
  getNodes: vi.fn(() =>
    nodes.map((node) => ({
      id: node.id,
      template: node.template ?? 'remindMeTool',
      instance: node.instance,
    })),
  ),
});

describe('RemindersService.cancelThreadReminders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cancels reminders for a single thread and clears timers', async () => {
    const prismaClient = {
      reminder: {
        updateMany: vi.fn(async () => ({ count: 3 })),
      },
    };
    const prismaService = { getClient: () => prismaClient };
    const eventsBus = {
      emitReminderCount: vi.fn(),
      emitThreadMetrics: vi.fn(),
      emitThreadMetricsAncestors: vi.fn(),
    };

    const node = new RemindMeNode(eventsBus as any, prismaService as any);
    node.init({ nodeId: 'node-a' } as any);
    const tool = node.getTool();

    const clearSpy = vi
      .spyOn(tool, 'clearTimersByThread')
      .mockImplementation((threadId: string) => {
        expect(threadId).toBe('thread-123');
        return ['r1', 'r2'];
      });

    const runtime = createRuntimeFixture({ id: 'node-a', instance: node }, { id: 'node-other', template: 'skip', instance: {} });
    const service = new RemindersService(prismaService as any, runtime as any, eventsBus as any);
    const logger = (service as unknown as { logger: { warn: (...args: unknown[]) => void } }).logger;
    vi.spyOn(logger, 'warn').mockImplementation(() => undefined);

    const result = await service.cancelThreadReminders({ threadId: 'thread-123', emitMetrics: true });

    expect(clearSpy).toHaveBeenCalledWith('thread-123');
    const [[updateArgs]] = prismaClient.reminder.updateMany.mock.calls as Array<[
      {
        where: { threadId: string; completedAt: null; cancelledAt: null };
        data: { cancelledAt: Date };
      }
    ]>;
    expect(updateArgs.where).toEqual({ threadId: 'thread-123', completedAt: null, cancelledAt: null });
    expect(updateArgs.data.cancelledAt).toBeInstanceOf(Date);
    expect(result).toEqual({ cancelledDb: 3, clearedRuntime: 2 });
    expect(eventsBus.emitThreadMetrics).toHaveBeenCalledWith({ threadId: 'thread-123' });
    expect(eventsBus.emitThreadMetricsAncestors).toHaveBeenCalledWith({ threadId: 'thread-123' });
  });

  it('logs and continues when a runtime node throws', async () => {
    const prismaClient = {
      reminder: {
        updateMany: vi.fn(async () => ({ count: 4 })),
      },
    };
    const prismaService = { getClient: () => prismaClient };
    const eventsBus = {
      emitReminderCount: vi.fn(),
      emitThreadMetrics: vi.fn(),
      emitThreadMetricsAncestors: vi.fn(),
    };

    const failingNode = new RemindMeNode(eventsBus as any, prismaService as any);
    failingNode.init({ nodeId: 'node-fail' } as any);
    const failingTool = failingNode.getTool();
    vi.spyOn(failingTool, 'clearTimersByThread').mockImplementation(() => {
      throw new Error('boom');
    });

    const succeedingNode = new RemindMeNode(eventsBus as any, prismaService as any);
    succeedingNode.init({ nodeId: 'node-ok' } as any);
    const succeedingTool = succeedingNode.getTool();
    vi.spyOn(succeedingTool, 'clearTimersByThread').mockImplementation(() => ['a', 'b']);

    const runtime = createRuntimeFixture(
      { id: 'node-fail', instance: failingNode },
      { id: 'node-ok', instance: succeedingNode },
    );
    const service = new RemindersService(prismaService as any, runtime as any, eventsBus as any);
    const logger = (service as unknown as { logger: { warn: (...args: unknown[]) => void } }).logger;
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);

    const result = await service.cancelThreadReminders({ threadId: 'thread-err' });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('RemindersService runtime cancellation error'),
    );
    expect(succeedingTool.clearTimersByThread).toHaveBeenCalledWith('thread-err');
    expect(result).toEqual({ cancelledDb: 4, clearedRuntime: 2 });
  });
});

describe('RemindersService.cancelReminder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cancels a single reminder and clears runtime timer', async () => {
    const prismaClient = {
      reminder: {
        findUnique: vi.fn(async () => ({ id: 'rem-1', threadId: 'thread-abc', completedAt: null, cancelledAt: null })),
        update: vi.fn(async () => ({ id: 'rem-1' })),
      },
    };
    const prismaService = { getClient: () => prismaClient };
    const eventsBus = {
      emitReminderCount: vi.fn(),
      emitThreadMetrics: vi.fn(),
      emitThreadMetricsAncestors: vi.fn(),
    };

    const node = new RemindMeNode(eventsBus as any, prismaService as any);
    node.init({ nodeId: 'node-1' } as any);
    const tool = node.getTool();
    const clearSpy = vi
      .spyOn(tool, 'clearTimerById')
      .mockImplementation((reminderId: string) => (reminderId === 'rem-1' ? 'thread-from-runtime' : null));

    const runtime = createRuntimeFixture({ id: 'node-1', instance: node });
    const service = new RemindersService(prismaService as any, runtime as any, eventsBus as any);

    const result = await service.cancelReminder({ reminderId: 'rem-1', emitMetrics: true });

    expect(result).toEqual({ threadId: 'thread-from-runtime', cancelledDb: true, clearedRuntime: 1 });
    expect(prismaClient.reminder.update).toHaveBeenCalled();
    expect(clearSpy).toHaveBeenCalledWith('rem-1');
    expect(eventsBus.emitThreadMetrics).toHaveBeenCalledWith({ threadId: 'thread-from-runtime' });
    expect(eventsBus.emitThreadMetricsAncestors).toHaveBeenCalledWith({ threadId: 'thread-from-runtime' });
  });

  it('returns null when reminder is not found', async () => {
    const prismaClient = {
      reminder: {
        findUnique: vi.fn(async () => null),
      },
    };
    const prismaService = { getClient: () => prismaClient };
    const eventsBus = {
      emitReminderCount: vi.fn(),
      emitThreadMetrics: vi.fn(),
      emitThreadMetricsAncestors: vi.fn(),
    };
    const runtime = createRuntimeFixture();
    const service = new RemindersService(prismaService as any, runtime as any, eventsBus as any);

    const result = await service.cancelReminder({ reminderId: 'missing', emitMetrics: true });

    expect(result).toBeNull();
    expect(eventsBus.emitThreadMetrics).not.toHaveBeenCalled();
  });
});
