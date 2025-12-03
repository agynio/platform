import { describe, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { AgentsThreadsController } from '../src/agents/threads.controller';
import { AgentsPersistenceService, ThreadParentNotFoundError } from '../src/agents/agents.persistence.service';
import { ThreadCleanupCoordinator } from '../src/agents/threadCleanup.coordinator';
import { RunEventsService } from '../src/events/run-events.service';
import { RunSignalsRegistry } from '../src/agents/run-signals.service';
import { LiveGraphRuntime } from '../src/graph-core/liveGraph.manager';
import { TemplateRegistry } from '../src/graph-core/templateRegistry';

const runEventsStub = {
  getRunSummary: async () => null,
  listRunEvents: async () => ({ items: [], nextCursor: null }),
  getToolOutputSnapshot: async () => null,
};

type SetupOptions = {
  nodes?: Array<{ id: string; template: string; instance: { status: string; invoke: ReturnType<typeof vi.fn> } }>;
  templateMeta?: Record<string, { kind: 'agent' | 'tool'; title: string }>;
  createThreadWithInitialMessage?: ReturnType<typeof vi.fn>;
};

async function setup(options: SetupOptions = {}) {
  const invoke = vi.fn(async () => 'queued');
  const nodes =
    options.nodes ?? [
      {
        id: 'agent-1',
        template: 'agent.template.one',
        instance: { status: 'ready', invoke },
      },
    ];

  const createThreadWithInitialMessage =
    options.createThreadWithInitialMessage ??
    vi.fn(async () => ({
      id: 'thread-new',
      alias: 'alias-new',
      summary: null,
      status: 'open',
      createdAt: new Date(),
      parentId: null,
      channelNodeId: null,
      assignedAgentNodeId: 'agent-1',
    }));

  const templateRegistryStub = {
    getMeta: (template: string) => options.templateMeta?.[template] ?? { kind: 'agent', title: template },
  } satisfies Pick<TemplateRegistry, 'getMeta'>;

  const moduleRef = await Test.createTestingModule({
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
          getThreadById: async () => null,
          getLatestAgentNodeIdForThread: async () => null,
          getRunById: async () => null,
          ensureAssignedAgent: async () => {},
          createThreadWithInitialMessage,
        },
      },
      { provide: ThreadCleanupCoordinator, useValue: { closeThreadWithCascade: vi.fn() } },
      { provide: RunEventsService, useValue: runEventsStub },
      { provide: RunSignalsRegistry, useValue: { register: vi.fn(), activateTerminate: vi.fn(), clear: vi.fn() } },
      { provide: LiveGraphRuntime, useValue: { getNodes: () => nodes } },
      { provide: TemplateRegistry, useValue: templateRegistryStub },
    ],
  }).compile();

  const controller = await moduleRef.resolve(AgentsThreadsController);
  return {
    controller,
    createThreadWithInitialMessage,
    invoke,
  };
}

describe('AgentsThreadsController POST /api/agents/threads', () => {
  it('returns bad_message_payload when text is missing', async () => {
    const { controller, createThreadWithInitialMessage } = await setup();

    await expect(controller.createThread({ agentNodeId: 'agent-1' } as any)).rejects.toMatchObject({
      status: 400,
      response: { error: 'bad_message_payload' },
    });

    expect(createThreadWithInitialMessage).not.toHaveBeenCalled();
  });

  it('returns bad_message_payload when agentNodeId is missing', async () => {
    const { controller, createThreadWithInitialMessage } = await setup();

    await expect(controller.createThread({ text: 'hello there' } as any)).rejects.toMatchObject({
      status: 400,
      response: { error: 'bad_message_payload' },
    });

    expect(createThreadWithInitialMessage).not.toHaveBeenCalled();
  });

  it('returns bad_message_payload when text exceeds limit', async () => {
    const { controller, createThreadWithInitialMessage } = await setup();

    await expect(
      controller.createThread({ text: 'a'.repeat(8001), agentNodeId: 'agent-1' } as any),
    ).rejects.toMatchObject({
      status: 400,
      response: { error: 'bad_message_payload' },
    });

    expect(createThreadWithInitialMessage).not.toHaveBeenCalled();
  });

  it('propagates parent_not_found errors without alteration', async () => {
    const createThreadWithInitialMessage = vi.fn(async () => {
      throw new ThreadParentNotFoundError();
    });
    const { controller } = await setup({ createThreadWithInitialMessage });

    await expect(
      controller.createThread({ text: 'hello', agentNodeId: 'agent-1', parentId: 'missing-parent' } as any),
    ).rejects.toMatchObject({
      status: 404,
      response: { error: 'parent_not_found' },
    });
  });
});
