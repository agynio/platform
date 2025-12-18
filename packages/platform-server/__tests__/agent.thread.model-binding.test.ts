import { Test } from '@nestjs/testing';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

import { AgentNode } from '../src/nodes/agent/agent.node';
import { ConfigService } from '../src/core/services/config.service';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';
import { RunEventsService } from '../src/events/run-events.service';
import { EventsBusService } from '../src/events/events-bus.service';
import { RunSignalsRegistry } from '../src/agents/run-signals.service';
import { PrismaService } from '../src/core/services/prisma.service';
import { ResponseMessage, HumanMessage, FunctionTool } from '@agyn/llm';
import { CallModelLLMReducer } from '../src/llm/reducers/callModel.llm.reducer';
import { SummarizationLLMReducer } from '../src/llm/reducers/summarization.llm.reducer';

class StubProvisioner extends LLMProvisioner {
  async init(): Promise<void> {}
  async getLLM(): Promise<{ call: () => Promise<ResponseMessage> }> {
    return {
      call: async () => ResponseMessage.fromText('ok'),
    };
  }

  async getReducers(): Promise<Record<string, FunctionTool>> {
    return {};
  }

  async teardown(): Promise<void> {}
}

describe('Agent thread model binding', () => {
  const baseConfig = {
    llmProvider: 'openai',
    litellmBaseUrl: 'http://localhost:4000',
    litellmMasterKey: 'sk-test',
  } as Partial<ConfigService>;

  let moduleRef: Awaited<ReturnType<typeof Test.createTestingModule>>;
  let agent: AgentNode;
  let beginRunThread: ReturnType<typeof vi.fn>;
  let completeRun: ReturnType<typeof vi.fn>;
  let recordInjected: ReturnType<typeof vi.fn>;
  let ensureThreadModel: ReturnType<typeof vi.fn>;
  let threadModels: Map<string, string | null>;

  const setupAgent = async (): Promise<void> => {
    threadModels = new Map();
    beginRunThread = vi.fn(async () => ({ runId: `run-${beginRunThread.mock.calls.length + 1}` }));
    completeRun = vi.fn(async () => {});
    recordInjected = vi.fn(async () => ({ messageIds: [] }));
    ensureThreadModel = vi.fn(async (threadId: string, model: string) => {
      const existing = threadModels.get(threadId);
      if (existing && existing.trim().length > 0) {
        return existing;
      }
      threadModels.set(threadId, model);
      return model;
    });

    moduleRef = await Test.createTestingModule({
      providers: [
        { provide: ConfigService, useValue: baseConfig },
        { provide: LLMProvisioner, useClass: StubProvisioner },
        AgentNode,
        {
          provide: PrismaService,
          useValue: {
            getClient: () => ({
              conversationState: {
                findUnique: async () => null,
                upsert: async () => {},
              },
            }),
          },
        },
        {
          provide: RunEventsService,
          useValue: {
            recordSummarization: vi.fn(async () => ({ id: 'event-id', type: 'summarization' })),
            createContextItems: vi.fn(async () => ['ctx-item']),
            startLLMCall: vi.fn(async () => ({ id: 'llm-event' })),
            completeLLMCall: vi.fn(async () => {}),
          },
        },
        { provide: EventsBusService, useValue: { publishEvent: vi.fn(async () => {}) } },
        RunSignalsRegistry,
        {
          provide: AgentsPersistenceService,
          useValue: {
            beginRunThread,
            completeRun,
            recordInjected,
            ensureThreadModel,
          },
        },
      ],
    }).compile();

    agent = await moduleRef.resolve(AgentNode);
    agent.init({ nodeId: 'agent-node' });
    await agent.setConfig({ debounceMs: 0 });
  };

  afterEach(async () => {
    await moduleRef?.close();
  });

  it('captures model on first run', async () => {
    await setupAgent();

    const callModelInit = vi.spyOn(CallModelLLMReducer.prototype, 'init');

    const result = await agent.invoke('thread-1', [HumanMessage.fromText('ping')]);
    expect(result).toBeInstanceOf(ResponseMessage);

    const persistedModel = threadModels.get('thread-1');
    expect(persistedModel).toBe('gpt-5');

    const callArgs = callModelInit.mock.calls.find((call) => typeof call[0]?.model === 'string')?.[0];
    expect(callArgs?.model).toBe('gpt-5');

    callModelInit.mockRestore();
  });

  it('keeps using captured model across config changes', async () => {
    await setupAgent();

    const callModelInit = vi.spyOn(CallModelLLMReducer.prototype, 'init');

    await agent.invoke('thread-1', [HumanMessage.fromText('first')]);
    expect(threadModels.get('thread-1')).toBe('gpt-5');

    callModelInit.mockClear();

    await agent.setConfig({ model: 'gpt-next' });
    await agent.invoke('thread-1', [HumanMessage.fromText('second')]);

    const secondCallArgs = callModelInit.mock.calls.find((call) => typeof call[0]?.model === 'string')?.[0];
    expect(secondCallArgs?.model).toBe('gpt-5');

    callModelInit.mockRestore();
  });

  it('uses updated model for new threads after config change', async () => {
    await setupAgent();

    await agent.invoke('thread-1', [HumanMessage.fromText('first')]);
    expect(threadModels.get('thread-1')).toBe('gpt-5');

    await agent.setConfig({ model: 'gpt-future' });

    const callModelInit = vi.spyOn(CallModelLLMReducer.prototype, 'init');
    await agent.invoke('thread-2', [HumanMessage.fromText('hello')]);

    expect(threadModels.get('thread-2')).toBe('gpt-future');
    const callArgs = callModelInit.mock.calls.find((call) => typeof call[0]?.model === 'string' && call[0].model === 'gpt-future');
    expect(callArgs).toBeDefined();

    callModelInit.mockRestore();
  });

  it('fills legacy threads missing model on demand', async () => {
    await setupAgent();

    threadModels.set('legacy-thread', null);

    const callModelInit = vi.spyOn(CallModelLLMReducer.prototype, 'init');
    const summarizationInit = vi.spyOn(SummarizationLLMReducer.prototype, 'init');

    const result = await agent.invoke('legacy-thread', [HumanMessage.fromText('hi')]);
    expect(result).toBeInstanceOf(ResponseMessage);

    expect(threadModels.get('legacy-thread')).toBe('gpt-5');
    const callArgs = callModelInit.mock.calls.find((call) => typeof call[0]?.model === 'string')?.[0];
    expect(callArgs?.model).toBe('gpt-5');
    const summaryArgs = summarizationInit.mock.calls.find((call) => typeof call[0]?.maxTokens === 'number')?.[0];
    expect(summaryArgs?.maxTokens).toBe(512);

    callModelInit.mockRestore();
    summarizationInit.mockRestore();
  });
});
