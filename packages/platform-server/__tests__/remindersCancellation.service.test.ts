import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RemindersCancellationService } from '../src/agents/remindersCancellation.service';
import { RemindMeNode } from '../src/nodes/tools/remind_me/remind_me.node';

const loggerStub = {
  warn: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
};

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

describe('RemindersCancellationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cancels runtime reminders, updates persistence, and emits metrics', async () => {
    const prismaClient = {
      reminder: {
        updateMany: vi.fn(async () => ({ count: 3 })),
      },
    };
    const prismaService = { getClient: () => prismaClient };
    const eventsBus = {
      emitThreadMetrics: vi.fn(),
      emitThreadMetricsAncestors: vi.fn(),
      emitReminderCount: vi.fn(),
    };

    const node = new RemindMeNode(eventsBus as any, prismaService as any);
    node.init({ nodeId: 'node-a' } as any);
    const tool = node.getTool();

    let capturedCancelledAt: Date | undefined;
    const cancelSpy = vi
      .spyOn(tool, 'cancelByThread')
      .mockImplementation(async (_threadId: string, prismaArg: unknown, cancelledAt?: Date) => {
        capturedCancelledAt = cancelledAt;
        expect(prismaArg).toBe(prismaClient);
        return 2;
      });

    const runtime = createRuntimeFixture({ id: 'node-a', instance: node }, { id: 'node-other', template: 'otherTool', instance: {} });

    const service = new RemindersCancellationService(
      prismaService as any,
      loggerStub as any,
      eventsBus as any,
      runtime as any,
    );

    const result = await service.cancelThread('thread-123');

    expect(capturedCancelledAt).toBeInstanceOf(Date);
    expect(cancelSpy).toHaveBeenCalledWith('thread-123', prismaClient, capturedCancelledAt);
    expect(prismaClient.reminder.updateMany).toHaveBeenCalledWith({
      where: { threadId: 'thread-123', completedAt: null, cancelledAt: null },
      data: { cancelledAt: capturedCancelledAt },
    });
    expect(eventsBus.emitThreadMetrics).toHaveBeenCalledWith({ threadId: 'thread-123' });
    expect(eventsBus.emitThreadMetricsAncestors).toHaveBeenCalledWith({ threadId: 'thread-123' });
    expect(result).toEqual({ cancelledDb: 3, cancelledRuntime: 2 });
  });

  it('continues cancellation when a node throws', async () => {
    const prismaClient = {
      reminder: {
        updateMany: vi.fn(async () => ({ count: 4 })),
      },
    };
    const prismaService = { getClient: () => prismaClient };
    const eventsBus = {
      emitThreadMetrics: vi.fn(),
      emitThreadMetricsAncestors: vi.fn(),
      emitReminderCount: vi.fn(),
    };
    const failingNode = new RemindMeNode(eventsBus as any, prismaService as any);
    failingNode.init({ nodeId: 'node-fail' } as any);
    const failingTool = failingNode.getTool();
    vi.spyOn(failingTool, 'cancelByThread').mockRejectedValue(new Error('boom'));

    const succeedingNode = new RemindMeNode(eventsBus as any, prismaService as any);
    succeedingNode.init({ nodeId: 'node-ok' } as any);
    const succeedingTool = succeedingNode.getTool();
    vi.spyOn(succeedingTool, 'cancelByThread').mockResolvedValue(5);

    const runtime = createRuntimeFixture(
      { id: 'node-fail', instance: failingNode },
      { id: 'node-ok', instance: succeedingNode },
      { id: 'node-other', template: 'otherTool', instance: {} },
    );

    const service = new RemindersCancellationService(
      prismaService as any,
      loggerStub as any,
      eventsBus as any,
      runtime as any,
    );

    const result = await service.cancelThread('thread-err');

    expect(loggerStub.warn).toHaveBeenCalledWith(
      'RemindersCancellationService node cancellation error',
      expect.objectContaining({ threadId: 'thread-err', nodeId: 'node-fail' }),
    );
    expect(succeedingTool.cancelByThread).toHaveBeenCalledWith(expect.any(String), prismaClient, expect.any(Date));
    expect(prismaClient.reminder.updateMany).toHaveBeenCalledWith({
      where: { threadId: 'thread-err', completedAt: null, cancelledAt: null },
      data: { cancelledAt: expect.any(Date) },
    });
    expect(eventsBus.emitThreadMetrics).toHaveBeenCalledWith({ threadId: 'thread-err' });
    expect(eventsBus.emitThreadMetricsAncestors).toHaveBeenCalledWith({ threadId: 'thread-err' });
    expect(result.cancelledRuntime).toBe(5);
    expect(result.cancelledDb).toBe(4);
  });
});
