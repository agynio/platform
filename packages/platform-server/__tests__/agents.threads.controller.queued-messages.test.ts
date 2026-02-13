import { describe, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { AgentsThreadsController } from '../src/agents/threads.controller';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { ThreadCleanupCoordinator } from '../src/agents/threadCleanup.coordinator';
import { RunEventsService } from '../src/events/run-events.service';
import { RunSignalsRegistry } from '../src/agents/run-signals.service';
import { LiveGraphRuntime } from '../src/graph-core/liveGraph.manager';
import { TemplateRegistry } from '../src/graph-core/templateRegistry';
import { InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { RemindersService } from '../src/agents/reminders.service';

const principal = { userId: 'user-1' } as any;

const runEventsStub = {
  getRunSummary: async () => null,
  listRunEvents: async () => ({ items: [], nextCursor: null }),
  getToolOutputSnapshot: async () => null,
};

type SetupOptions = {
  thread?:
    | null
    | {
        id: string;
        assignedAgentNodeId: string | null;
      };
  nodes?: Array<{
    id: string;
    template: string;
    instance: {
      status: string;
      invoke: ReturnType<typeof vi.fn>;
      listQueuedPreview: ReturnType<typeof vi.fn>;
      clearQueuedMessages?: ReturnType<typeof vi.fn>;
    };
  }>;
  templateMeta?: Record<string, { kind: 'agent' | 'tool'; title: string } | undefined>;
  remindersService?: {
    cancelThreadReminders?: ReturnType<typeof vi.fn>;
  };
};

async function setup(options: SetupOptions = {}) {
  const thread =
    options.thread === undefined
      ? { id: 'thread-1', assignedAgentNodeId: 'agent-1' }
      : options.thread;
  const nodes =
    options.nodes === undefined
      ? thread?.assignedAgentNodeId
        ? [
            {
              id: thread.assignedAgentNodeId,
              template: 'agent',
              instance: { status: 'ready', invoke: vi.fn(), listQueuedPreview: vi.fn(() => []) },
            },
          ]
        : []
      : options.nodes;

  const getThreadById = vi.fn(async () => thread);
  const templateRegistryStub = {
    getMeta: (template: string) => options.templateMeta?.[template] ?? (template === 'agent' ? { kind: 'agent', title: 'Agent' } : undefined),
  } satisfies Pick<TemplateRegistry, 'getMeta'>;

  const module = await Test.createTestingModule({
    controllers: [AgentsThreadsController],
    providers: [
      {
        provide: AgentsPersistenceService,
        useValue: {
          listThreads: async () => [],
          listChildren: async () => [],
          listRuns: async () => [],
          listRunMessages: async () => [],
          getThreadsMetrics: async () => ({}),
          getThreadsAgentTitles: async () => ({}),
          updateThread: async () => ({ previousStatus: 'open', status: 'open' }),
          getThreadById,
          getLatestAgentNodeIdForThread: async () => null,
          getRunById: async () => null,
          ensureAssignedAgent: async () => {},
        },
      },
      { provide: ThreadCleanupCoordinator, useValue: { closeThreadWithCascade: vi.fn() } },
      { provide: RunEventsService, useValue: runEventsStub },
      { provide: RunSignalsRegistry, useValue: { register: vi.fn(), activateTerminate: vi.fn(), clear: vi.fn() } },
      { provide: LiveGraphRuntime, useValue: { getNodes: () => nodes } },
      { provide: TemplateRegistry, useValue: templateRegistryStub },
      {
        provide: RemindersService,
        useValue: {
          cancelThreadReminders:
            options.remindersService?.cancelThreadReminders ?? vi.fn(async () => ({ cancelledDb: 0, clearedRuntime: 0 })),
        },
      },
    ],
  }).compile();

  const controller = await module.resolve(AgentsThreadsController);
  const reminders = await module.resolve(RemindersService);
  return {
    controller,
    getThreadById,
    reminders,
  };
}

describe('AgentsThreadsController GET /api/agents/threads/:threadId/queued-messages', () => {
  it('returns queued messages snapshot when agent node is live', async () => {
    const listQueuedPreview = vi.fn(() => [{ id: 'msg-1', text: 'hello', ts: 1700000000000 }]);
    const { controller } = await setup({
      thread: { id: 'thread-1', assignedAgentNodeId: 'agent-1' },
      nodes: [{ id: 'agent-1', template: 'agent', instance: { status: 'ready', invoke: vi.fn(), listQueuedPreview } }],
    });

    const result = await controller.listQueuedMessages('thread-1', principal);

    expect(result.items).toEqual([
      { id: 'msg-1', text: 'hello', enqueuedAt: new Date(1700000000000).toISOString() },
    ]);
    expect(listQueuedPreview).toHaveBeenCalledWith('thread-1');
  });

  it('returns empty array when no live agent node exists', async () => {
    const { controller } = await setup({
      thread: { id: 'thread-1', assignedAgentNodeId: 'agent-1' },
      nodes: [],
    });

    const result = await controller.listQueuedMessages('thread-1', principal);

    expect(result).toEqual({ items: [] });
  });

  it('throws when thread does not exist', async () => {
    const { controller } = await setup({ thread: null });

    await expect(controller.listQueuedMessages('missing-thread', principal)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('normalizes missing text fields to empty string', async () => {
    const listQueuedPreview = vi.fn(() => [{ id: 'msg-2', text: undefined as unknown as string, ts: 1700000001000 }]);
    const { controller } = await setup({
      thread: { id: 'thread-1', assignedAgentNodeId: 'agent-1' },
      nodes: [{ id: 'agent-1', template: 'agent', instance: { status: 'ready', invoke: vi.fn(), listQueuedPreview } }],
    });

    const result = await controller.listQueuedMessages('thread-1', principal);

    expect(result.items).toEqual([
      { id: 'msg-2', text: '', enqueuedAt: new Date(1700000001000).toISOString() },
    ]);
  });
});

describe('AgentsThreadsController DELETE /api/agents/threads/:threadId/queued-messages', () => {
  it('clears queued messages when agent exposes capability', async () => {
    const clearQueuedMessages = vi.fn(() => 5);
    const { controller } = await setup({
      thread: { id: 'thread-1', assignedAgentNodeId: 'agent-1' },
      nodes: [
        {
          id: 'agent-1',
          template: 'agent',
          instance: {
            status: 'ready',
            invoke: vi.fn(),
            listQueuedPreview: vi.fn(() => []),
            clearQueuedMessages,
          },
        },
      ],
    });

    const result = await controller.clearQueuedMessages('thread-1', principal);

    expect(result).toEqual({ clearedCount: 5 });
    expect(clearQueuedMessages).toHaveBeenCalledWith('thread-1');
  });

  it('returns zero when agent lacks queue management support', async () => {
    const { controller } = await setup({
      thread: { id: 'thread-1', assignedAgentNodeId: 'agent-1' },
      nodes: [
        {
          id: 'agent-1',
          template: 'agent',
          instance: { status: 'ready', invoke: vi.fn(), listQueuedPreview: vi.fn(() => []) },
        },
      ],
    });

    const result = await controller.clearQueuedMessages('thread-1', principal);

    expect(result).toEqual({ clearedCount: 0 });
  });

  it('throws when runtime throws', async () => {
    const clearQueuedMessages = vi.fn(() => {
      throw new Error('boom');
    });
    const { controller } = await setup({
      thread: { id: 'thread-1', assignedAgentNodeId: 'agent-1' },
      nodes: [
        {
          id: 'agent-1',
          template: 'agent',
          instance: {
            status: 'ready',
            invoke: vi.fn(),
            listQueuedPreview: vi.fn(() => []),
            clearQueuedMessages,
          },
        },
      ],
    });

    await expect(controller.clearQueuedMessages('thread-1', principal)).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('throws when thread is missing', async () => {
    const { controller } = await setup({ thread: null });

    await expect(controller.clearQueuedMessages('thread-1', principal)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('AgentsThreadsController POST /api/agents/threads/:threadId/reminders/cancel', () => {
  it('delegates to RemindersService and returns counts', async () => {
    const cancelThreadReminders = vi.fn(async () => ({ cancelledDb: 2, clearedRuntime: 1 }));
    const { controller } = await setup({ remindersService: { cancelThreadReminders } });

    const result = await controller.cancelThreadReminders('thread-1', principal);

    expect(cancelThreadReminders).toHaveBeenCalledWith({ threadId: 'thread-1', emitMetrics: true });
    expect(result).toEqual({ cancelledDb: 2, clearedRuntime: 1 });
  });

  it('throws NotFound when thread does not exist', async () => {
    const cancelThreadReminders = vi.fn();
    const { controller } = await setup({ thread: null, remindersService: { cancelThreadReminders } });

    await expect(controller.cancelThreadReminders('missing-thread', principal)).rejects.toBeInstanceOf(NotFoundException);
    expect(cancelThreadReminders).not.toHaveBeenCalled();
  });

  it('wraps service errors into InternalServerError', async () => {
    const cancelThreadReminders = vi.fn(async () => {
      throw new Error('service_fail');
    });
    const { controller } = await setup({ remindersService: { cancelThreadReminders } });

    await expect(controller.cancelThreadReminders('thread-1', principal)).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});

describe('AgentsThreadsController POST /api/agents/threads/:threadId/reminders/cancel', () => {
  it('delegates to reminders service', async () => {
    const { controller, reminders } = await setup();
    const spy = vi.spyOn(reminders, 'cancelThreadReminders').mockResolvedValue({ cancelledDb: 2, clearedRuntime: 1 });

    const result = await controller.cancelThreadReminders('thread-1', principal);

    expect(result).toEqual({ cancelledDb: 2, clearedRuntime: 1 });
    expect(spy).toHaveBeenCalledWith({ threadId: 'thread-1', emitMetrics: true });
  });

  it('throws 404 when thread missing', async () => {
    const { controller } = await setup({ thread: null });

    await expect(controller.cancelThreadReminders('thread-1', principal)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('bubbles errors from service as 500', async () => {
    const { controller, reminders } = await setup();
    vi.spyOn(reminders, 'cancelThreadReminders').mockRejectedValue(new Error('fail'));

    await expect(controller.cancelThreadReminders('thread-1', principal)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });
});
