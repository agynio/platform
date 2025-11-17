import { describe, it, expect } from 'vitest';
import { LoggerService } from '../src/core/services/logger.service';
import { CallAgentTool } from '../src/nodes/tools/call_agent/call_agent.node';
import { ResponseMessage, HumanMessage } from '@agyn/llm';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { NoopGraphEventsPublisher } from '../src/gateway/graph.events.publisher';
import { Signal } from '../src/signal';
import { createPrismaStub, StubPrismaService } from './helpers/prisma.stub';
import { createRunEventsStub } from './helpers/runEvents.stub';
import { CallAgentLinkingService } from '../src/agents/call-agent-linking.service';

const metricsStub = { getThreadsMetrics: async () => ({}) } as any;
const templateRegistryStub = { toSchema: async () => [], getMeta: () => undefined } as any;
const graphRepoStub = {
  get: async () => ({ name: 'main', version: 1, updatedAt: new Date().toISOString(), nodes: [], edges: [] }),
} as any;

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
    const persistence = new AgentsPersistenceService(
      new StubPrismaService(stub) as any,
      new LoggerService(),
      metricsStub,
      new NoopGraphEventsPublisher(),
      templateRegistryStub,
      graphRepoStub,
      createRunEventsStub() as any,
      {
        buildInitialMetadata: (params: { toolName: string; parentThreadId: string; childThreadId: string }) => ({
          tool: params.toolName === 'call_engineer' ? 'call_engineer' : 'call_agent',
          parentThreadId: params.parentThreadId,
          childThreadId: params.childThreadId,
          childRun: { id: null, status: 'queued', linkEnabled: false, latestMessageId: null },
          childRunId: null,
          childRunStatus: 'queued',
          childRunLinkEnabled: false,
          childMessageId: null,
        }),
        registerParentToolExecution: async () => null,
        onChildRunStarted: async () => null,
        onChildRunMessage: async () => null,
        onChildRunCompleted: async () => null,
      } as unknown as CallAgentLinkingService,
    );
    const linking = {
      buildInitialMetadata: (params: { toolName: string; parentThreadId: string; childThreadId: string }) => ({
        tool: params.toolName === 'call_engineer' ? 'call_engineer' : 'call_agent',
        parentThreadId: params.parentThreadId,
        childThreadId: params.childThreadId,
        childRun: { id: null, status: 'queued', linkEnabled: false, latestMessageId: null },
        childRunId: null,
        childRunStatus: 'queued',
        childRunLinkEnabled: false,
        childMessageId: null,
      }),
      registerParentToolExecution: async () => null,
      onChildRunStarted: async () => null,
      onChildRunMessage: async () => null,
      onChildRunCompleted: async () => null,
    } as unknown as CallAgentLinkingService;
    const tool = new CallAgentTool(new LoggerService(), persistence, linking);
    await tool.setConfig({ description: 'desc', response: 'sync' });
    // Attach fake agent that persists runs/threads
    // @ts-expect-error accessing private for test setup
    tool['setAgent'](new FakeAgentWithPersistence(persistence) as any);

    const dynamic = tool.getTool();
    // Create parent thread and use its UUID in ctx.threadId
    const parentThreadId = await persistence.getOrCreateThreadByAlias('test', 'parentX', 'Parent X');
    const res = await dynamic.execute(
      { input: 'do', threadAlias: 'childX', summary: 'Child X' },
      { threadId: parentThreadId, runId: 'r', finishSignal: new Signal(), callerAgent: { invoke: async () => ResponseMessage.fromText('OK') } } as any,
    );
    expect(res).toBe('OK');

    const parent = stub._store.threads.find((t: any) => t.alias === 'parentX');
    const child = stub._store.threads.find((t: any) => t.parentId === parent.id);
    expect(parent).toBeTruthy();
    expect(child).toBeTruthy();
    expect(child.parentId).toBe(parent.id);
  });
});
