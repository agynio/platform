import { describe, it, expect, vi } from 'vitest';
import { CallAgentTool } from '../src/nodes/tools/call_agent/call_agent.node';
import { LoggerService } from '../src/core/services/logger.service.js';
import { ResponseMessage, AIMessage, HumanMessage } from '@agyn/llm';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { NoopGraphEventsPublisher } from '../src/gateway/graph.events.publisher';
import { StubPrismaService, createPrismaStub } from './helpers/prisma.stub';
import { createRunEventsStub } from './helpers/runEvents.stub';
import { Signal } from '../src/signal';
import { CallAgentLinkingService } from '../src/agents/call-agent-linking.service';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const metricsStub = { getThreadsMetrics: async () => ({}) } as any;
const templateRegistryStub = { toSchema: async () => [], getMeta: () => undefined } as any;
const graphRepoStub = {
  get: async () => ({ name: 'main', version: 1, updatedAt: new Date().toISOString(), nodes: [], edges: [] }),
} as any;

const createLinkingStub = () => {
  const spies = {
    buildInitialMetadata: vi.fn((params: { toolName: string; parentThreadId: string; childThreadId: string }) => ({
      tool: params.toolName === 'call_engineer' ? 'call_engineer' : 'call_agent',
      parentThreadId: params.parentThreadId,
      childThreadId: params.childThreadId,
      childRun: { id: null, status: 'queued', linkEnabled: false, latestMessageId: null },
      childRunId: null,
      childRunStatus: 'queued',
      childRunLinkEnabled: false,
      childMessageId: null,
    })),
    registerParentToolExecution: vi.fn().mockResolvedValue('evt-parent'),
    onChildRunStarted: vi.fn().mockResolvedValue(null),
    onChildRunMessage: vi.fn().mockResolvedValue(null),
    onChildRunCompleted: vi.fn().mockResolvedValue(null),
  } satisfies Record<string, unknown>;

  return { instance: spies as unknown as CallAgentLinkingService, spies };
};

const createPersistence = (linking?: CallAgentLinkingService) => {
  const eventsBusStub = { publishEvent: vi.fn().mockResolvedValue(null) } as any;
  const svc = new AgentsPersistenceService(
    new StubPrismaService(createPrismaStub()) as any,
    new LoggerService(),
    metricsStub,
    templateRegistryStub,
    graphRepoStub,
    createRunEventsStub() as any,
    linking ?? createLinkingStub().instance,
    eventsBusStub,
  );
  svc.setEventsPublisher(new NoopGraphEventsPublisher());
  return svc;
};

class FakeAgent {
  constructor(private responder?: (thread: string, msgs: HumanMessage[]) => Promise<ResponseMessage>) {}
  async invoke(thread: string, messages: HumanMessage[]): Promise<ResponseMessage> {
    if (this.responder) return this.responder(thread, messages);
    const ai = AIMessage.fromText('OK');
    return new ResponseMessage({ output: [ai.toPlain()] });
  }
}

describe('CallAgentTool unit', () => {
  it('returns error when no agent attached', async () => {
    const { instance: linking } = createLinkingStub();
    const tool = new CallAgentTool(new LoggerService(), createPersistence(linking), linking);
    await expect(tool.setConfig({ description: 'desc' })).resolves.toBeUndefined();
    const dynamic = tool.getTool();
    await expect(dynamic.execute({ input: 'hi', threadAlias: 'x', summary: 'x summary' }, { threadId: 't1', runId: 'r', finishSignal: new Signal(), terminateSignal: new Signal(), callerAgent: {} } as any)).rejects.toThrowError(
      'Agent not set',
    );
  });

  it('calls attached agent and returns its response.text', async () => {
    const { instance: linking, spies } = createLinkingStub();
    const persistence = createPersistence(linking);
    const tool = new CallAgentTool(new LoggerService(), persistence, linking);
    await tool.setConfig({ description: 'desc', response: 'sync' });
    const agent = new FakeAgent(async (_thread, _msgs) => {
      const ai = AIMessage.fromText('OK');
      return new ResponseMessage({ output: [ai.toPlain()] });
    });
  // @ts-expect-error private for unit
    tool['setAgent'](agent as any);
    const dynamic = tool.getTool();
    const out = await dynamic.execute(
      { input: 'ping', threadAlias: 'sub', summary: 'sub summary' },
      { threadId: 't2', runId: 'r', finishSignal: new Signal(), terminateSignal: new Signal(), callerAgent: {} },
    );
    expect(out).toBe('OK');
    expect(spies.registerParentToolExecution).toHaveBeenCalledTimes(1);
  });

  // Context pass-through removed; tool forwards only text input.

  it('uses provided description in tool metadata', async () => {
    const { instance: linking } = createLinkingStub();
    const tool = new CallAgentTool(new LoggerService(), createPersistence(linking), linking);
    await tool.setConfig({ description: 'My desc' });
    const dynamic = tool.getTool();
    expect(dynamic.description).toBe('My desc');
    expect(dynamic.name).toBe('call_agent');
  });

  it('resolves subthread by alias under parent UUID', async () => {
    const { instance: linking } = createLinkingStub();
    const persistence = createPersistence(linking);
    const tool = new CallAgentTool(new LoggerService(), persistence, linking);
    await tool.setConfig({ description: 'desc', response: 'sync' });
    const agent = new FakeAgent(async (_thread, _msgs) => {
      const ai = AIMessage.fromText('OK');
      return new ResponseMessage({ output: [ai.toPlain()] });
    });
  // @ts-expect-error private for unit
    tool['setAgent'](agent as any);
    const dynamic = tool.getTool();
    const out = await dynamic.execute(
      { input: 'ping', threadAlias: 'sub', summary: 'sub summary' },
      { threadId: 'parent', runId: 'r', finishSignal: new Signal(), terminateSignal: new Signal(), callerAgent: {} },
    );
    expect(out).toBe('OK');
  });

  it('async mode returns sent immediately', async () => {
    const { instance: linking } = createLinkingStub();
    const tool = new CallAgentTool(new LoggerService(), createPersistence(linking), linking);
    await tool.setConfig({ description: 'desc', response: 'async' });
    const child = new FakeAgent(async (thread, msgs) => {
      expect(msgs[0]?.text).toBe('do work');
      const ai = AIMessage.fromText('child-complete');
      return new ResponseMessage({ output: [ai.toPlain()] });
    });
  // @ts-expect-error private for unit
    tool['setAgent'](child as any);
    const dynamic = tool.getTool();
    const res = await dynamic.execute(
      { input: 'do work', threadAlias: 'c1', summary: 'c1 summary' },
      { threadId: 'p', runId: 'r', finishSignal: new Signal(), terminateSignal: new Signal(), callerAgent: {} },
    );
    expect(typeof res).toBe('string');
    expect(JSON.parse(res).status).toBe('sent');
  });

  it('ignore mode returns sent and does not trigger parent', async () => {
    const { instance: linking } = createLinkingStub();
    const tool = new CallAgentTool(new LoggerService(), createPersistence(linking), linking);
    await tool.setConfig({ description: 'desc', response: 'ignore' });
    const child = new FakeAgent(async () => {
      const ai = AIMessage.fromText('ignored');
      return new ResponseMessage({ output: [ai.toPlain()] });
    });
  // @ts-expect-error private for unit
    tool['setAgent'](child as any);
    const dynamic = tool.getTool();
    const res = await dynamic.execute(
      { input: 'do work', threadAlias: 'c2', summary: 'c2 summary' },
      { threadId: 'p2', runId: 'r', finishSignal: new Signal(), terminateSignal: new Signal(), callerAgent: {} },
    );
    expect(typeof res).toBe('string');
    expect(JSON.parse(res).status).toBe('sent');
  });

  it('registers parent tool execution when resolving subthread', async () => {
    const getSubthreadMock = vi.fn().mockResolvedValue('child-thread');
    const persistence = { getOrCreateSubthreadByAlias: getSubthreadMock } as unknown as AgentsPersistenceService;
    const { instance: linking, spies } = createLinkingStub();
    const tool = new CallAgentTool(new LoggerService(), persistence, linking);
    await tool.setConfig({ description: 'desc', response: 'sync' });
    const agent = new FakeAgent(async (_thread, _msgs) => {
      const ai = AIMessage.fromText('OK');
      return new ResponseMessage({ output: [ai.toPlain()] });
    });
  // @ts-expect-error private for unit
    tool['setAgent'](agent as any);
    const dynamic = tool.getTool();
    const ctx = { threadId: 'parent-thread', runId: 'run-1', finishSignal: new Signal(), terminateSignal: new Signal(), callerAgent: {} } as any;
    const args = { input: 'hello', threadAlias: 'alias', summary: 'summary' };

    const res = await dynamic.execute(args, ctx);
    expect(res).toBe('OK');
    expect(getSubthreadMock).toHaveBeenCalledTimes(1);
    expect(spies.registerParentToolExecution).toHaveBeenCalledWith({
      runId: 'run-1',
      parentThreadId: 'parent-thread',
      childThreadId: 'child-thread',
      toolName: 'call_agent',
    });
  });
});

// Graph wiring test requires full LiveGraphRuntime and persistence; skipped in unit environment.
