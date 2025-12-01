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
import { createPrismaStub, StubPrismaService } from './helpers/prisma.stub';
import { ThreadsMetricsService } from '../src/agents/threads.metrics.service';
import { SendMessageFunctionTool } from '../src/nodes/tools/send_message/send_message.tool';
import { CallAgentLinkingService } from '../src/agents/call-agent-linking.service';
import { EventsBusService } from '../src/events/events-bus.service';

const runEventsStub = {
  getRunSummary: async () => null,
  listRunEvents: async () => ({ items: [], nextCursor: null }),
  getToolOutputSnapshot: async () => null,
};

type SetupOptions = {
  thread?: { id: string; status: ThreadStatus; assignedAgentNodeId?: string | null } | null;
  latestAgentNodeId?: string | null;
  nodes?: Array<{ id: string; template: string; instance: { status: string; invoke: ReturnType<typeof vi.fn> } }>;
  templateMeta?: Record<string, { kind: 'agent' | 'tool'; title: string }>;
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

  it('detects agent nodes registered under custom template names', async () => {
    const invoke = vi.fn(async () => 'queued');
    const { controller, getLatestAgentNodeIdForThread, ensureAssignedAgent } = await setup({
      latestAgentNodeId: 'custom-agent-node',
      nodes: [{ id: 'custom-agent-node', template: 'custom.agent', instance: { status: 'ready', invoke } }],
      templateMeta: { 'custom.agent': { kind: 'agent', title: 'Custom Agent' } },
    });

    await controller.sendThreadMessage('thread-1', { text: 'hello meta agent' });

    expect(getLatestAgentNodeIdForThread).toHaveBeenCalledWith('thread-1', { candidateNodeIds: ['custom-agent-node'] });
    expect(ensureAssignedAgent).toHaveBeenCalledWith('thread-1', 'custom-agent-node');
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('persists run and message without forwarding for internal threads', async () => {
    const prismaStub = createPrismaStub();
    const prismaService = new StubPrismaService(prismaStub) as any;
    const metricsService = new ThreadsMetricsService(prismaService as any);
    const templateRegistryStub: Partial<TemplateRegistry> = {
      getMeta: (template: string) => (template === 'agent.template' ? { kind: 'agent', title: 'Agent' } : undefined),
    };
    const graphRepoStub = {
      initIfNeeded: async () => undefined,
      get: async () => ({ name: 'main', version: 1, updatedAt: new Date().toISOString(), nodes: [], edges: [] }),
      upsert: async () => ({ name: 'main', version: 1, updatedAt: new Date().toISOString(), nodes: [], edges: [] }),
      upsertNodeState: async () => undefined,
    };
    let eventCounter = 0;
    const runEventsStub: Partial<RunEventsService> = {
      recordInvocationMessage: vi.fn(async () => ({ id: `event-${++eventCounter}` } as any)),
    };
    const callAgentLinkingImpl: Partial<CallAgentLinkingService> = {
      buildInitialMetadata: vi.fn(() => ({
        tool: 'call_agent',
        parentThreadId: '',
        childThreadId: '',
        childRun: { id: null, status: 'queued', linkEnabled: false, latestMessageId: null },
        childRunId: null,
        childRunStatus: 'queued',
        childRunLinkEnabled: false,
        childMessageId: null,
      })),
      registerParentToolExecution: vi.fn(async () => null),
      onChildRunStarted: vi.fn(async () => null),
      onChildRunMessage: vi.fn(async () => null),
      onChildRunCompleted: vi.fn(async () => null),
      resolveLinkedAgentNodes: vi.fn(async () => ({})),
    };
    const eventsBusStub: Partial<EventsBusService> = {
      emitThreadCreated: vi.fn(),
      emitThreadUpdated: vi.fn(),
      emitRunStatusChanged: vi.fn(),
      emitMessageCreated: vi.fn(),
      emitThreadMetrics: vi.fn(),
      publishEvent: vi.fn(async () => undefined),
    };
    const persistence = new AgentsPersistenceService(
      prismaService as any,
      metricsService as any,
      templateRegistryStub as TemplateRegistry,
      graphRepoStub as any,
      runEventsStub as RunEventsService,
      callAgentLinkingImpl as CallAgentLinkingService,
      eventsBusStub as EventsBusService,
    );
    const cleanupStub = { closeThreadWithCascade: vi.fn() } as unknown as ThreadCleanupCoordinator;
    const runSignalsStub = { register: vi.fn(), activateTerminate: vi.fn(), clear: vi.fn() } as unknown as RunSignalsRegistry;

    const sendToolRuntime = { getNodeInstance: vi.fn(() => undefined) } as Partial<LiveGraphRuntime>;
    const sendTool = new SendMessageFunctionTool(prismaService as any, sendToolRuntime as unknown as LiveGraphRuntime);
    let toolResult: string | undefined;
    let resolveInvoke!: () => void;
    const invokeCompleted = new Promise<void>((resolve) => {
      resolveInvoke = resolve;
    });
    const agentInvoke = vi.fn(async (threadId: string, messages: unknown[]) => {
      await persistence.beginRunThread(threadId, messages as any, 'agent-1');
      toolResult = await sendTool.execute({ message: 'agent response' }, { threadId });
      resolveInvoke();
      return 'queued';
    });

    const agentNode = { id: 'agent-1', template: 'agent.template', instance: { status: 'ready', invoke: agentInvoke } };
    const runtimeStub = {
      getNodes: () => [agentNode],
    } as unknown as LiveGraphRuntime;

    const controller = new AgentsThreadsController(
      persistence,
      cleanupStub,
      runEventsStub as RunEventsService,
      runSignalsStub,
      runtimeStub,
      templateRegistryStub as TemplateRegistry,
    );

    const thread = await prismaStub.thread.create({
      data: { alias: 'internal:thread', summary: 'Internal', assignedAgentNodeId: 'agent-1', channel: null, channelNodeId: null },
    });

    const response = await controller.sendThreadMessage(thread.id, { text: 'Hello internal' });
    expect(response).toEqual({ ok: true });
    await invokeCompleted;

    expect(prismaStub._store.runs).toHaveLength(1);
    expect(prismaStub._store.messages).toHaveLength(1);
    expect(runEventsStub.recordInvocationMessage).toHaveBeenCalled();
    expect(eventsBusStub.emitMessageCreated).toHaveBeenCalled();
    expect(toolResult).toBe('message sent successfully');
    expect(sendToolRuntime.getNodeInstance).not.toHaveBeenCalled();
  });
});
