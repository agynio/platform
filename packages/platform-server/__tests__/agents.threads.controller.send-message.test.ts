import { describe, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { AgentsThreadsController } from '../src/agents/threads.controller';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { ThreadCleanupCoordinator } from '../src/agents/threadCleanup.coordinator';
import { RunEventsService } from '../src/events/run-events.service';
import { RunSignalsRegistry } from '../src/agents/run-signals.service';
import { LiveGraphRuntime } from '../src/graph-core/liveGraph.manager';
import { TemplateRegistry } from '../src/graph-core/templateRegistry';
import type { ThreadStatus } from '@prisma/client';
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { RemindersService } from '../src/agents/reminders.service';

const principal = { userId: 'user-1' } as any;

const runEventsStub = {
  getRunSummary: async () => null,
  listRunEvents: async () => ({ items: [], nextCursor: null }),
  getToolOutputSnapshot: async () => null,
};

type SetupOptions = {
  thread?: { id: string; status: ThreadStatus; assignedAgentNodeId?: string | null } | null;
  nodes?: Array<{ id: string; template: string; instance: { status: string; invoke: ReturnType<typeof vi.fn> } }>;
  templateMeta?: Record<string, { kind: 'agent' | 'tool'; title: string }>;
};

async function setup(options: SetupOptions = {}) {
  const invoke = vi.fn(async () => 'queued');
  const thread =
    options.thread === undefined
      ? { id: 'thread-1', status: 'open' as ThreadStatus, assignedAgentNodeId: 'agent-1' }
      : options.thread;
  const nodes =
    options.nodes === undefined
      ? thread?.assignedAgentNodeId
        ? [{ id: thread.assignedAgentNodeId, template: 'agent', instance: { status: 'ready', invoke } }]
        : []
      : options.nodes;

  const getThreadById = vi.fn(async () => thread);
  const getLatestAgentNodeIdForThread = vi.fn(async () => null);
  const ensureAssignedAgent = vi.fn(async () => {});
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
          getLatestAgentNodeIdForThread,
          getRunById: async () => null,
          ensureAssignedAgent,
        },
      },
      { provide: ThreadCleanupCoordinator, useValue: { closeThreadWithCascade: vi.fn() } },
      { provide: RunEventsService, useValue: runEventsStub },
      { provide: RunSignalsRegistry, useValue: { register: vi.fn(), activateTerminate: vi.fn(), clear: vi.fn() } },
      { provide: LiveGraphRuntime, useValue: { getNodes: () => nodes } },
      { provide: TemplateRegistry, useValue: templateRegistryStub },
      { provide: RemindersService, useValue: { cancelThreadReminders: vi.fn(), cancelReminder: vi.fn() } },
    ],
  }).compile();

  const controller = await module.resolve(AgentsThreadsController);
  return {
    controller,
    invoke,
    getThreadById,
    getLatestAgentNodeIdForThread,
    ensureAssignedAgent,
  };
}

describe('AgentsThreadsController POST /api/agents/threads/:threadId/messages', () => {
  it('dispatches message to agent runtime when thread is open', async () => {
    const { controller, invoke, getLatestAgentNodeIdForThread, ensureAssignedAgent } = await setup();

    const result = await controller.sendThreadMessage('thread-1', { text: '  hello world  ' }, principal);

    expect(result).toEqual({ ok: true });
    expect(getLatestAgentNodeIdForThread).not.toHaveBeenCalled();
    expect(ensureAssignedAgent).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledTimes(1);
    const args = invoke.mock.calls[0];
    expect(args[0]).toBe('thread-1');
    expect(Array.isArray(args[1])).toBe(true);
    expect(args[1][0]).toMatchObject({ text: 'hello world' });
  });

  it('rejects when message body is invalid', async () => {
    const { controller } = await setup();
    await expect(controller.sendThreadMessage('thread-1', { text: '   ' }, principal)).rejects.toMatchObject({
      status: 400,
      response: { error: 'bad_message_payload' },
    });
  });

  it('rejects when message exceeds limit', async () => {
    const { controller } = await setup();
    const overLimit = 'a'.repeat(100001);

    await expect(controller.sendThreadMessage('thread-1', { text: overLimit }, principal)).rejects.toMatchObject({
      status: 400,
      response: { error: 'bad_message_payload' },
    });
  });

  it('returns not found when thread does not exist', async () => {
    const { controller } = await setup({ thread: null, latestAgentNodeId: null });
    expect.assertions(2);
    try {
      await controller.sendThreadMessage('missing-thread', { text: 'hello' }, principal);
      throw new Error('expected NotFoundException');
    } catch (error) {
      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).getResponse()).toEqual({ error: 'thread_not_found' });
    }
  });

  it('rejects when thread is closed', async () => {
    const { controller } = await setup({ thread: { id: 'thread-1', status: 'closed' as ThreadStatus } });
    await expect(controller.sendThreadMessage('thread-1', { text: 'hello' }, principal)).rejects.toMatchObject({
      status: 409,
      response: { error: 'thread_closed' },
    });
  });

  it('rejects when no agent node is available', async () => {
    const { controller } = await setup({
      thread: { id: 'thread-1', status: 'open' as ThreadStatus, assignedAgentNodeId: 'agent-1' },
      nodes: [],
    });
    expect.assertions(2);
    try {
      await controller.sendThreadMessage('thread-1', { text: 'hello' }, principal);
      throw new Error('expected ServiceUnavailableException');
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect((error as ServiceUnavailableException).getResponse()).toEqual({ error: 'agent_unavailable' });
    }
  });

  it('rejects when thread is missing an assigned agent', async () => {
    const { controller } = await setup({ thread: { id: 'thread-1', status: 'open' as ThreadStatus, assignedAgentNodeId: null } });
    await expect(controller.sendThreadMessage('thread-1', { text: 'hello' }, principal)).rejects.toMatchObject({
      status: 503,
      response: { error: 'agent_unavailable' },
    });
  });

  it('rejects when agent is not ready', async () => {
    const invoke = vi.fn(async () => 'queued');
    const { controller } = await setup({
      nodes: [{ id: 'agent-1', template: 'agent', instance: { status: 'not_ready', invoke } }],
    });
    await expect(controller.sendThreadMessage('thread-1', { text: 'hello' }, principal)).rejects.toMatchObject({
      status: 503,
      response: { error: 'agent_unready' },
    });
  });

  it('detects agent nodes registered under custom template names', async () => {
    const invoke = vi.fn(async () => 'queued');
    const { controller, getLatestAgentNodeIdForThread, ensureAssignedAgent } = await setup({
      thread: { id: 'thread-1', status: 'open' as ThreadStatus, assignedAgentNodeId: 'custom-agent-node' },
      nodes: [{ id: 'custom-agent-node', template: 'custom.agent', instance: { status: 'ready', invoke } }],
      templateMeta: { 'custom.agent': { kind: 'agent', title: 'Custom Agent' } },
    });

    await controller.sendThreadMessage('thread-1', { text: 'hello meta agent' }, principal);

    expect(getLatestAgentNodeIdForThread).not.toHaveBeenCalled();
    expect(ensureAssignedAgent).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
