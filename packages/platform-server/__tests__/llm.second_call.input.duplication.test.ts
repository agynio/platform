import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';

import { AgentNode } from '../src/nodes/agent/agent.node';
import { ConfigService } from '../src/core/services/config.service';
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';
import type { LLM } from '@agyn/llm';
import {
  AIMessage,
  HumanMessage,
  ResponseMessage,
  SystemMessage,
  ToolCallMessage,
  ToolCallOutputMessage,
} from '@agyn/llm';
import { PrismaService } from '../src/core/services/prisma.service';
import { RunEventsService } from '../src/events/run-events.service';
import { EventsBusService } from '../src/events/events-bus.service';
import { RunSignalsRegistry } from '../src/agents/run-signals.service';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { createEventsBusStub, createRunEventsStub } from './helpers/runEvents.stub';

vi.mock('@agyn/docker-runner', () => ({}));

class FakeLLM implements Pick<LLM, 'call'> {
  public readonly calls: Array<{ model: string; input: Parameters<LLM['call']>[0]['input']; tools?: unknown[] }> = [];

  async call(params: Parameters<LLM['call']>[0]): Promise<ResponseMessage> {
    this.calls.push({ model: params.model, input: params.input, tools: params.tools });
    const order = this.calls.length;
    if (order === 1) {
      return this.toolCallResponse();
    }
    if (order === 2) {
      return ResponseMessage.fromText('final');
    }
    return ResponseMessage.fromText(`extra-${order}`);
  }

  private toolCallResponse(): ResponseMessage {
    const toolCallPlain = {
      id: 'call-1',
      type: 'function_call',
      call_id: 'call-1',
      name: 'demo',
      arguments: '{}',
      status: 'completed',
    } as ReturnType<ToolCallMessage['toPlain']> & { status: string };

    const emptyAssistantPlain = {
      id: 'msg-1',
      type: 'message',
      role: 'assistant',
      status: 'completed',
      content: [
        {
          type: 'output_text',
          text: '',
          annotations: [],
        },
      ],
    } as ReturnType<AIMessage['toPlain']> & { status: string };

    return new ResponseMessage({ output: [emptyAssistantPlain, toolCallPlain] as any });
  }
}

class SilentLLM implements Pick<LLM, 'call'> {
  async call(): Promise<ResponseMessage> {
    throw new Error('Summarization LLM should not be invoked in this test');
  }
}

class FakeProvisioner extends LLMProvisioner {
  private callIndex = 0;

  constructor(private readonly callModelLLM: FakeLLM, private readonly summarizationLLM: SilentLLM) {
    super();
  }

  async init(): Promise<void> {}

  async getLLM(): Promise<LLM> {
    this.callIndex += 1;
    if (this.callIndex === 1) {
      return this.callModelLLM as unknown as LLM;
    }
    return this.summarizationLLM as unknown as LLM;
  }

  async teardown(): Promise<void> {}
}

describe('AgentNode second LLM call input', () => {
  const baseConfig: Partial<ConfigService> = {
    llmProvider: 'fake',
  };

  let moduleRef: Awaited<ReturnType<typeof Test.createTestingModule>>;
  let agent: AgentNode;
  let fakeLLM: FakeLLM;
  let capturedSecondCallInput: Parameters<LLM['call']>[0]['input'] | null;

  const conversationState = new Map<string, unknown>();

  beforeEach(async () => {
    fakeLLM = new FakeLLM();
    const summaryLLM = new SilentLLM();
    const provisioner = new FakeProvisioner(fakeLLM, summaryLLM);
    const runEvents = createRunEventsStub();
    const eventsBus = createEventsBusStub();
    capturedSecondCallInput = null;

    const prismaClient = {
      conversationState: {
        findUnique: async ({ where }: { where: { threadId_nodeId: { threadId: string; nodeId: string } } }) => {
          const { threadId, nodeId } = where.threadId_nodeId;
          const key = `${threadId}::${nodeId}`;
          if (!conversationState.has(key)) return null;
          return { threadId, nodeId, state: conversationState.get(key) };
        },
        upsert: async ({
          where,
          create,
          update,
        }: {
          where: { threadId_nodeId: { threadId: string; nodeId: string } };
          create: { threadId: string; nodeId: string; state: unknown };
          update: { state: unknown };
        }) => {
          const { threadId, nodeId } = where.threadId_nodeId;
          const key = `${threadId}::${nodeId}`;
          const payload = conversationState.has(key) ? update.state : create.state;
          conversationState.set(key, payload);
          return { threadId, nodeId, state: payload };
        },
      },
    };

    let runCounter = 0;
    const threadModels = new Map<string, string>();

    moduleRef = await Test.createTestingModule({
      providers: [
        AgentNode,
        RunSignalsRegistry,
        { provide: ConfigService, useValue: baseConfig },
        { provide: LLMProvisioner, useValue: provisioner },
        {
          provide: PrismaService,
          useValue: {
            getClient: () => prismaClient,
          },
        },
        { provide: RunEventsService, useValue: runEvents },
        { provide: EventsBusService, useValue: eventsBus },
        {
          provide: AgentsPersistenceService,
          useValue: {
            beginRunThread: async () => ({ runId: `run-${++runCounter}` }),
            completeRun: async () => {},
            recordInjected: async () => ({ messageIds: [] }),
            ensureThreadModel: async (threadId: string, model: string) => {
              if (!threadModels.has(threadId)) {
                threadModels.set(threadId, model);
                return model;
              }
              return threadModels.get(threadId) ?? model;
            },
          },
        },
      ],
    }).compile();

    agent = await moduleRef.resolve(AgentNode);
    agent.init({ nodeId: 'agent-node' });
    await agent.setConfig({
      debounceMs: 0,
      sendFinalResponseToThread: false,
      summarizationKeepTokens: 0,
      summarizationMaxTokens: 1024,
    });
  });

  afterEach(async () => {
    await moduleRef?.close();
    conversationState.clear();
  });

  it.fails('captures duplicate assistant entries in second model call input', async () => {
    const result = await agent.invoke('thread-dup', [HumanMessage.fromText('start')]);
    expect(result).toBeInstanceOf(ResponseMessage);

    expect(fakeLLM.calls.length).toBeGreaterThanOrEqual(2);
    capturedSecondCallInput = fakeLLM.calls[1]?.input ?? null;
    expect(capturedSecondCallInput).not.toBeNull();

    const secondInput = capturedSecondCallInput ?? [];
    const responseMessages = secondInput.filter((msg): msg is ResponseMessage => msg instanceof ResponseMessage);
    const toolOutputs = secondInput.filter((msg): msg is ToolCallOutputMessage => msg instanceof ToolCallOutputMessage);
    const systemMessages = secondInput.filter((msg): msg is SystemMessage => msg instanceof SystemMessage);
    const humanMessages = secondInput.filter((msg): msg is HumanMessage => msg instanceof HumanMessage);

    const summary = {
      order: secondInput.map((msg) => msg.constructor.name),
      counts: {
        system: systemMessages.length,
        human: humanMessages.length,
        response: responseMessages.length,
        toolCallOutput: toolOutputs.length,
      },
      responses: responseMessages.map((msg) => msg.toPlain()),
    };

    console.info('Second LLM call input summary:', JSON.stringify(summary, null, 2));

    expect(responseMessages.length).toBe(2);
  });
});
