import { describe, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConfigService } from '../src/core/services/config.service';
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { AgentNode } from '../src/nodes/agent/agent.node';
import { HumanMessage } from '@agyn/llm';
import { AgentsThreadsController } from '../src/agents/threads.controller';
import { ThreadCleanupCoordinator } from '../src/agents/threadCleanup.coordinator';
import { RunEventsService } from '../src/events/run-events.service';
import { RunSignalsRegistry } from '../src/agents/run-signals.service';
import { LiveGraphRuntime } from '../src/graph-core/liveGraph.manager';
import { TemplateRegistry } from '../src/graph-core/templateRegistry';

class StubLLMProvisioner extends LLMProvisioner {
  async init(): Promise<void> {}
  async getLLM(): Promise<{ call: (messages: unknown) => Promise<{ text: string; output: unknown[] }> }> {
    return { call: async () => ({ text: 'ok', output: [] }) };
  }
  async teardown(): Promise<void> {}
}

describe('Fail-fast behavior', () => {
  it('AgentNode.invoke propagates persistence beginRun error', async () => {
    const module = await Test.createTestingModule({
      providers: [
        ConfigService,
        { provide: LLMProvisioner, useClass: StubLLMProvisioner },
        AgentNode,
        {
          provide: AgentsPersistenceService,
          useValue: {
            beginRunThread: async () => {
              throw new Error('persistence_fail');
            },
            ensureThreadModel: async (_threadId: string, model: string) => model,
            recordInjected: async () => ({ messageIds: [] }),
            completeRun: async () => {},
          },
        },
        { provide: RunSignalsRegistry, useValue: { register: vi.fn(), activateTerminate: vi.fn(), clear: vi.fn() } },
      ],
    }).compile();

    const agent = await module.resolve(AgentNode);
    await agent.setConfig({});
    const loggerStub = { error: vi.fn(), warn: vi.fn(), log: vi.fn(), debug: vi.fn() };
    (agent as any).logger = loggerStub;
    agent.setRuntimeContext({ nodeId: 'A', get: (_id: string) => undefined });

    await expect(agent.invoke('thread-1', [HumanMessage.fromText('hi')])).rejects.toBeTruthy();
    expect(loggerStub.error).toHaveBeenCalled();
  });

  it('AgentsThreadsController.listThreads bubbles persistence errors as 500', async () => {
    const module = await Test.createTestingModule({
      controllers: [AgentsThreadsController],
      providers: [
        {
          provide: RunEventsService,
          useValue: {
            getRunSummary: async () => ({
              status: 'unknown',
              totalEvents: 0,
              firstEventAt: null,
              lastEventAt: null,
              countsByType: {
                invocation_message: 0,
                injection: 0,
                llm_call: 0,
                tool_execution: 0,
                summarization: 0,
              },
            }),
            listRunEvents: async () => ({ items: [], nextCursor: null }),
            getEventSnapshot: async () => null,
            publishEvent: async () => null,
          },
        },
        {
          provide: AgentsPersistenceService,
          useValue: {
            listThreads: async () => { throw new Error('db_fail'); },
            listRuns: async () => [],
            listRunMessages: async () => [],
          },
        },
        { provide: ThreadCleanupCoordinator, useValue: { closeThreadWithCascade: vi.fn() } },
        { provide: RunSignalsRegistry, useValue: { register: vi.fn(), activateTerminate: vi.fn(), clear: vi.fn() } },
        { provide: LiveGraphRuntime, useValue: { getNodes: vi.fn(() => []) } },
        { provide: TemplateRegistry, useValue: { getMeta: vi.fn(() => undefined) } satisfies Pick<TemplateRegistry, 'getMeta'> },
      ],
    }).compile();

    const ctrl = await module.resolve(AgentsThreadsController);
    await expect(ctrl.listThreads({} as any)).rejects.toBeTruthy();
  });
});
