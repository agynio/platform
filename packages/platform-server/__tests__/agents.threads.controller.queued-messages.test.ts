import { describe, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { AgentsThreadsController } from '../src/agents/threads.controller';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { ThreadCleanupCoordinator } from '../src/agents/threadCleanup.coordinator';
import { RunEventsService } from '../src/events/run-events.service';
import { RunSignalsRegistry } from '../src/agents/run-signals.service';
import { LiveGraphRuntime } from '../src/graph-core/liveGraph.manager';
import { TemplateRegistry } from '../src/graph-core/templateRegistry';
import { NotFoundException } from '@nestjs/common';

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
    instance: { status: string; invoke: ReturnType<typeof vi.fn>; listQueuedPreview: ReturnType<typeof vi.fn> };
  }>;
  templateMeta?: Record<string, { kind: 'agent' | 'tool'; title: string } | undefined>;
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
    ],
  }).compile();

  const controller = await module.resolve(AgentsThreadsController);
  return {
    controller,
    getThreadById,
  };
}

describe('AgentsThreadsController GET /api/agents/threads/:threadId/queued-messages', () => {
  it('returns queued messages snapshot when agent node is live', async () => {
    const listQueuedPreview = vi.fn(() => [{ id: 'msg-1', text: 'hello', ts: 1700000000000 }]);
    const { controller } = await setup({
      thread: { id: 'thread-1', assignedAgentNodeId: 'agent-1' },
      nodes: [{ id: 'agent-1', template: 'agent', instance: { status: 'ready', invoke: vi.fn(), listQueuedPreview } }],
    });

    const result = await controller.listQueuedMessages('thread-1');

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

    const result = await controller.listQueuedMessages('thread-1');

    expect(result).toEqual({ items: [] });
  });

  it('throws when thread does not exist', async () => {
    const { controller } = await setup({ thread: null });

    await expect(controller.listQueuedMessages('missing-thread')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('normalizes missing text fields to empty string', async () => {
    const listQueuedPreview = vi.fn(() => [{ id: 'msg-2', text: undefined as unknown as string, ts: 1700000001000 }]);
    const { controller } = await setup({
      thread: { id: 'thread-1', assignedAgentNodeId: 'agent-1' },
      nodes: [{ id: 'agent-1', template: 'agent', instance: { status: 'ready', invoke: vi.fn(), listQueuedPreview } }],
    });

    const result = await controller.listQueuedMessages('thread-1');

    expect(result.items).toEqual([
      { id: 'msg-2', text: '', enqueuedAt: new Date(1700000001000).toISOString() },
    ]);
  });
});
