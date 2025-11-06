import { describe, it, expect } from 'vitest';
import { LoggerService } from '../src/core/services/logger.service';
import { CallAgentTool } from '../src/graph/nodes/tools/call_agent/call_agent.node';
import { ResponseMessage, HumanMessage } from '@agyn/llm';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { NoopGraphEventsPublisher } from '../src/gateway/graph.events.publisher';
import { Signal } from '../src/signal';
import { createPrismaStub, StubPrismaService } from './helpers/prisma.stub';

class FakeAgentWithPersistence {
  constructor(private persistence: AgentsPersistenceService) {}
  async invoke(thread: string, _messages: any[]): Promise<ResponseMessage> {
    // Persist strictly-typed HumanMessage to comply with AgentsPersistenceService expectations
    await this.persistence.beginRunThread(thread, [HumanMessage.fromText('work')]);
    return ResponseMessage.fromText('OK');
  }
}

describe('call_agent integration: creates child thread with parentId', () => {
  it('creates parent and child threads and sets child.parentId', async () => {
    const stub = createPrismaStub();
    const persistence = new AgentsPersistenceService(new StubPrismaService(stub) as any, new LoggerService(), { getThreadsMetrics: async () => ({}) } as any, new NoopGraphEventsPublisher());
    const tool = new CallAgentTool(new LoggerService(), persistence);
    await tool.setConfig({ description: 'desc', response: 'sync' });
    // Attach fake agent that persists runs/threads
    // @ts-expect-error accessing private for test setup
    tool['setAgent'](new FakeAgentWithPersistence(persistence) as any);

    const dynamic = tool.getTool();
    // Create parent thread and use its UUID in ctx.threadId
    const parentThreadId = await persistence.getOrCreateThreadByAlias('test', 'parentX');
    const res = await dynamic.execute({ input: 'do', threadAlias: 'childX' }, { threadId: parentThreadId, finishSignal: new Signal(), callerAgent: { invoke: async () => ResponseMessage.fromText('OK') } } as any);
    expect(res).toBe('OK');

    const parent = stub._store.threads.find((t: any) => t.alias === 'parentX');
    const child = stub._store.threads.find((t: any) => t.parentId === parent.id);
    expect(parent).toBeTruthy();
    expect(child).toBeTruthy();
    expect(child.parentId).toBe(parent.id);
  });
});
