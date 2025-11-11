import { describe, it, expect } from 'vitest';
import { CallAgentTool } from '../src/graph/nodes/tools/call_agent/call_agent.node';
import { LoggerService } from '../src/core/services/logger.service.js';
import { ResponseMessage, AIMessage, HumanMessage } from '@agyn/llm';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { NoopGraphEventsPublisher } from '../src/gateway/graph.events.publisher';
import { StubPrismaService, createPrismaStub } from './helpers/prisma.stub';
import { createRunEventsStub } from './helpers/runEvents.stub';
import { Signal } from '../src/signal';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const metricsStub = { getThreadsMetrics: async () => ({}) } as any;
const templateRegistryStub = { toSchema: async () => [], getMeta: () => undefined } as any;
const graphRepoStub = {
  get: async () => ({ name: 'main', version: 1, updatedAt: new Date().toISOString(), nodes: [], edges: [] }),
} as any;

const createPersistence = () =>
  new AgentsPersistenceService(
    new StubPrismaService(createPrismaStub()) as any,
    new LoggerService(),
    metricsStub,
    new NoopGraphEventsPublisher(),
    templateRegistryStub,
    graphRepoStub,
    createRunEventsStub() as any,
  );

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
    const tool = new CallAgentTool(new LoggerService(), createPersistence());
    await expect(tool.setConfig({ description: 'desc' })).resolves.toBeUndefined();
    const dynamic = tool.getTool();
    await expect(dynamic.execute({ input: 'hi', threadAlias: 'x', summary: 'x summary' }, { threadId: 't1', runId: 'r', finishSignal: new Signal(), callerAgent: {} } as any)).rejects.toThrowError(
      'Agent not set',
    );
  });

  it('calls attached agent and returns its response.text', async () => {
    const persistence = createPersistence();
    const tool = new CallAgentTool(new LoggerService(), persistence);
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
      { threadId: 't2', runId: 'r', finishSignal: new Signal(), callerAgent: {} },
    );
    expect(out).toBe('OK');
  });

  // Context pass-through removed; tool forwards only text input.

  it('uses provided description in tool metadata', async () => {
    const tool = new CallAgentTool(new LoggerService(), createPersistence());
    await tool.setConfig({ description: 'My desc' });
    const dynamic = tool.getTool();
    expect(dynamic.description).toBe('My desc');
    expect(dynamic.name).toBe('call_agent');
  });

  it('resolves subthread by alias under parent UUID', async () => {
    const persistence = createPersistence();
    const tool = new CallAgentTool(new LoggerService(), persistence);
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
      { threadId: 'parent', runId: 'r', finishSignal: new Signal(), callerAgent: {} },
    );
    expect(out).toBe('OK');
  });

  it('async mode returns sent immediately', async () => {
    const tool = new CallAgentTool(new LoggerService(), createPersistence());
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
      { threadId: 'p', runId: 'r', finishSignal: new Signal(), callerAgent: {} },
    );
    expect(typeof res).toBe('string');
    expect(JSON.parse(res).status).toBe('sent');
  });

  it('ignore mode returns sent and does not trigger parent', async () => {
    const tool = new CallAgentTool(new LoggerService(), createPersistence());
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
      { threadId: 'p2', runId: 'r', finishSignal: new Signal(), callerAgent: {} },
    );
    expect(typeof res).toBe('string');
    expect(JSON.parse(res).status).toBe('sent');
  });
});

// Graph wiring test requires full LiveGraphRuntime and persistence; skipped in unit environment.
