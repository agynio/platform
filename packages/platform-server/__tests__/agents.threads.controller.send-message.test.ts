import { describe, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { AgentsThreadsController } from '../src/agents/threads.controller';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { ThreadCleanupCoordinator } from '../src/agents/threadCleanup.coordinator';
import { RunEventsService } from '../src/events/run-events.service';
import { RunSignalsRegistry } from '../src/agents/run-signals.service';
import { LiveGraphRuntime } from '../src/graph-core/liveGraph.manager';
import type { ThreadStatus } from '@prisma/client';
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';

const runEventsStub = {
  getRunSummary: async () => null,
  listRunEvents: async () => ({ items: [], nextCursor: null }),
  getToolOutputSnapshot: async () => null,
};

type SetupOptions = {
  thread?: { id: string; status: ThreadStatus; assignedAgentNodeId?: string | null } | null;
  latestAgentNodeId?: string | null;
  nodes?: Array<{ id: string; template: string; instance: { status: string; invoke: ReturnType<typeof vi.fn> } }>;
};

async function setup(options: SetupOptions = {}) {
  const invoke = vi.fn(async () => 'queued');
  const thread =
    options.thread === undefined
      ? { id: 'thread-1', status: 'open' as ThreadStatus, assignedAgentNodeId: null }
      : options.thread;
  const latestAgentNodeId =
    options.latestAgentNodeId === undefined ? (thread ? 'agent-1' : null) : options.latestAgentNodeId;
  const nodes =
    options.nodes === undefined
      ? latestAgentNodeId
        ? [{ id: latestAgentNodeId, template: 'agent', instance: { status: 'ready', invoke } }]
        : []
      : options.nodes;

  const getThreadById = vi.fn(async () => thread);
  const getLatestAgentNodeIdForThread = vi.fn(async () => latestAgentNodeId);
  const ensureAssignedAgent = vi.fn(async () => {});
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

    const result = await controller.sendThreadMessage('thread-1', { text: '  hello world  ' });

    expect(result).toEqual({ ok: true });
    expect(getLatestAgentNodeIdForThread).toHaveBeenCalledWith('thread-1', { candidateNodeIds: ['agent-1'] });
    expect(ensureAssignedAgent).toHaveBeenCalledWith('thread-1', 'agent-1');
    expect(invoke).toHaveBeenCalledTimes(1);
    const args = invoke.mock.calls[0];
    expect(args[0]).toBe('thread-1');
    expect(Array.isArray(args[1])).toBe(true);
    expect(args[1][0]).toMatchObject({ text: 'hello world' });
  });

  it('uses assigned agent without falling back when available', async () => {
    const { controller, invoke, getLatestAgentNodeIdForThread, ensureAssignedAgent } = await setup({
      thread: { id: 'thread-1', status: 'open' as ThreadStatus, assignedAgentNodeId: 'agent-1' },
      latestAgentNodeId: 'agent-1',
    });

    await controller.sendThreadMessage('thread-1', { text: 'hello' });

    expect(getLatestAgentNodeIdForThread).not.toHaveBeenCalled();
    expect(ensureAssignedAgent).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('rejects when message body is invalid', async () => {
    const { controller } = await setup();
    await expect(controller.sendThreadMessage('thread-1', { text: '   ' })).rejects.toMatchObject({
      status: 400,
      response: { error: 'bad_message_payload' },
    });
  });

  it('returns not found when thread does not exist', async () => {
    const { controller } = await setup({ thread: null, latestAgentNodeId: null });
    expect.assertions(2);
    try {
      await controller.sendThreadMessage('missing-thread', { text: 'hello' });
      throw new Error('expected NotFoundException');
    } catch (error) {
      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).getResponse()).toEqual({ error: 'thread_not_found' });
    }
  });

  it('rejects when thread is closed', async () => {
    const { controller } = await setup({ thread: { id: 'thread-1', status: 'closed' as ThreadStatus } });
    await expect(controller.sendThreadMessage('thread-1', { text: 'hello' })).rejects.toMatchObject({
      status: 409,
      response: { error: 'thread_closed' },
    });
  });

  it('rejects when no agent node is available', async () => {
    const { controller } = await setup({ latestAgentNodeId: null });
    expect.assertions(2);
    try {
      await controller.sendThreadMessage('thread-1', { text: 'hello' });
      throw new Error('expected ServiceUnavailableException');
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect((error as ServiceUnavailableException).getResponse()).toEqual({ error: 'agent_unavailable' });
    }
  });

  it('rejects when agent is not ready', async () => {
    const invoke = vi.fn(async () => 'queued');
    const { controller } = await setup({
      nodes: [{ id: 'agent-1', template: 'agent', instance: { status: 'not_ready', invoke } }],
    });
    await expect(controller.sendThreadMessage('thread-1', { text: 'hello' })).rejects.toMatchObject({
      status: 503,
      response: { error: 'agent_unready' },
    });
  });
});
