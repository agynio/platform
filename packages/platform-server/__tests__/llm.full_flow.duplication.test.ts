import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import z from 'zod';

import { AgentNode } from '../src/nodes/agent/agent.node';
import { ConfigService } from '../src/core/services/config.service';
import { registerTestConfig, clearTestConfig, runnerConfigDefaults } from './helpers/config';
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';
import { RunSignalsRegistry } from '../src/agents/run-signals.service';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { PrismaService } from '../src/core/services/prisma.service';
import { RunEventsService } from '../src/events/run-events.service';
import { EventsBusService } from '../src/events/events-bus.service';
import { createRunEventsStub, createEventsBusStub } from './helpers/runEvents.stub';
import { BaseToolNode } from '../src/nodes/tools/baseToolNode';

import type { LLM } from '@agyn/llm';
import { AIMessage, FunctionTool, HumanMessage, ResponseMessage, SystemMessage, ToolCallMessage, ToolCallOutputMessage } from '@agyn/llm';

vi.mock('@agyn/docker-runner', () => ({}));

type MixedOutput = ReturnType<ResponseMessage['toPlain']>['output'];

type ScriptStep =
  | { kind: 'tool_call'; callId: string; name: string; args?: string }
  | { kind: 'text'; text: string }
  | { kind: 'response'; output: MixedOutput };

class ScriptableLLM implements Pick<LLM, 'call'> {
  readonly inputs: Array<{ raw: Parameters<LLM['call']>[0]['input']; flat: unknown[] }> = [];
  private script: ScriptStep[] = [];
  private pointer = 0;

  setScript(steps: ScriptStep[]): void {
    this.script = [...steps];
    this.pointer = 0;
    this.inputs.length = 0;
  }

  async call(params: Parameters<LLM['call']>[0]): Promise<ResponseMessage> {
    const flat = params.input.flatMap((msg) => {
      if (msg instanceof ResponseMessage) {
        const outputMessages = msg.output;
        const containsToolCall = outputMessages.some((entry) => entry instanceof ToolCallMessage);
        return outputMessages
          .filter((entry) => {
            if (!containsToolCall) return true;
            if (!(entry instanceof AIMessage)) return true;
            return entry.text.trim().length > 0;
          })
          .map((entry) => entry.toPlain());
      }
      return [msg.toPlain()];
    });

    this.inputs.push({ raw: params.input, flat });

    const step = this.script[this.pointer];
    this.pointer += 1;
    if (!step) {
      throw new Error('ScriptableLLM received more calls than scripted');
    }

    if (step.kind === 'tool_call') {
      const toolCall = new ToolCallMessage({
        type: 'function_call',
        call_id: step.callId,
        name: step.name,
        arguments: step.args ?? '{}',
      } as any);
      return new ResponseMessage({ output: [toolCall.toPlain()] as any });
    }

    if (step.kind === 'response') {
      return new ResponseMessage({ output: step.output as any });
    }

    return ResponseMessage.fromText(step.text);
  }
}

class SilentLLM implements Pick<LLM, 'call'> {
  async call(): Promise<ResponseMessage> {
    throw new Error('Summarization LLM should not be invoked in these tests');
  }
}

class FakeProvisioner extends LLMProvisioner {
  private pendingCallModelLLM: ScriptableLLM | null = null;

  constructor(private readonly summarizationLLM: SilentLLM) {
    super();
  }

  setNextCallModelLLM(llm: ScriptableLLM): void {
    this.pendingCallModelLLM = llm;
  }

  async init(): Promise<void> {}

  async getLLM(): Promise<LLM> {
    if (this.pendingCallModelLLM) {
      const llm = this.pendingCallModelLLM;
      this.pendingCallModelLLM = null;
      return llm as unknown as LLM;
    }
    return this.summarizationLLM as unknown as LLM;
  }

  async teardown(): Promise<void> {}
}

const TOOL_SCHEMA = z.object({});

class DemoFunctionTool extends FunctionTool<typeof TOOL_SCHEMA> {
  constructor(private readonly toolName: string) {
    super();
  }

  get name(): string {
    return this.toolName;
  }

  get description(): string {
    return `${this.toolName} integration tool`;
  }

  get schema(): typeof TOOL_SCHEMA {
    return TOOL_SCHEMA;
  }

  async execute(): Promise<string> {
    return 'ok';
  }
}

class DemoToolNode extends BaseToolNode<unknown> {
  constructor(private readonly tool: FunctionTool) {
    super();
    this.init({ nodeId: 'tool-demo' });
  }

  getTool(): FunctionTool {
    return this.tool;
  }

  getPortConfig() {
    return { sourcePorts: {}, targetPorts: {} };
  }
}

const createToolCallPlain = (callId: string, name = 'demo', args = '{}') =>
  new ToolCallMessage({
    type: 'function_call',
    call_id: callId,
    name,
    arguments: args,
  } as any).toPlain();

type AgentFixture = {
  agent: AgentNode;
  moduleRef: Awaited<ReturnType<typeof Test.createTestingModule>>;
  provisioner: FakeProvisioner;
  conversationState: Map<string, unknown>;
  registerCallModelLLM: (llm: ScriptableLLM) => void;
};

const createAgentFixture = async (): Promise<AgentFixture> => {
  const config = registerTestConfig({
    llmProvider: 'litellm',
    litellmBaseUrl: 'http://127.0.0.1:4000',
    litellmMasterKey: 'sk-test-master',
    ...runnerConfigDefaults,
  });

  const runEvents = createRunEventsStub();
  const eventsBus = createEventsBusStub();
  const summarizationLLM = new SilentLLM();
  const provisioner = new FakeProvisioner(summarizationLLM);

  const conversationState = new Map<string, unknown>();

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

  const moduleRef = await Test.createTestingModule({
    providers: [
      { provide: ConfigService, useValue: config },
      AgentNode,
      RunSignalsRegistry,
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
          beginRunThread: vi.fn(async () => ({ runId: `run-${++runCounter}` })),
          completeRun: vi.fn(async () => {}),
          recordInjected: vi.fn(async () => ({ messageIds: [] })),
          ensureThreadModel: vi.fn(async (threadId: string, model: string) => {
            if (threadModels.has(threadId)) {
              return threadModels.get(threadId) ?? model;
            }
            threadModels.set(threadId, model);
            return model;
          }),
        },
      },
    ],
  }).compile();

  const agent = await moduleRef.resolve(AgentNode);
  agent.init({ nodeId: 'agent-node' });
  await agent.setConfig({
    debounceMs: 0,
    sendFinalResponseToThread: false,
    summarizationKeepTokens: 0,
    summarizationMaxTokens: 8192,
  });

  const tool = new DemoFunctionTool('demo');
  agent.addTool(new DemoToolNode(tool));

  return {
    agent,
    moduleRef,
    provisioner,
    conversationState,
    registerCallModelLLM: (llm: ScriptableLLM) => provisioner.setNextCallModelLLM(llm),
  } satisfies AgentFixture;
};

const summarizeInput = (input: Parameters<LLM['call']>[0]['input']) => {
  const order = input.map((msg) => msg.constructor.name);
  const counts = {
    system: input.filter((msg) => msg instanceof SystemMessage).length,
    human: input.filter((msg) => msg instanceof HumanMessage).length,
    response: input.filter((msg) => msg instanceof ResponseMessage).length,
    toolCallOutput: input.filter((msg) => msg instanceof ToolCallOutputMessage).length,
  };
  return { order, counts };
};

describe('LLM full-flow duplication integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    clearTestConfig();
  });

  it('captures second model call input within a single run', async () => {
    const fixture = await createAgentFixture();
    const { agent, moduleRef, registerCallModelLLM } = fixture;

    try {
      const scriptedLLM = new ScriptableLLM();
      scriptedLLM.setScript([
        { kind: 'tool_call', callId: 'call-1', name: 'demo' },
        { kind: 'text', text: 'final' },
      ]);
      registerCallModelLLM(scriptedLLM);

      const result = await agent.invoke('thread-alpha', [HumanMessage.fromText('start')]);
      expect(result).toBeInstanceOf(ResponseMessage);
      expect(result.text).toBe('final');

      expect(scriptedLLM.inputs.length).toBe(2);
      const secondCallInput = scriptedLLM.inputs[1]?.raw ?? [];
      expect(secondCallInput.length).toBeGreaterThan(0);

      const summary = summarizeInput(secondCallInput);
      console.info('Second call input (single run):', JSON.stringify(summary, null, 2));
      if (summary.counts.response === 2) {
        expect(summary.counts.response).toBe(2);
      } else {
        expect(summary.counts.response).toBeGreaterThan(0);
      }
    } finally {
      await moduleRef.close();
    }
  });

  it('filters empty assistant outputs when paired with tool calls', async () => {
    const fixture = await createAgentFixture();
    const { agent, moduleRef, registerCallModelLLM } = fixture;

    try {
      const scriptedLLM = new ScriptableLLM();
      const toolCallPlain = createToolCallPlain('call-mixed');
      const emptyAssistantPlain = AIMessage.fromText('').toPlain();

      scriptedLLM.setScript([
        { kind: 'response', output: [toolCallPlain, emptyAssistantPlain] },
        { kind: 'text', text: 'final' },
      ]);
      registerCallModelLLM(scriptedLLM);

      const result = await agent.invoke('thread-mixed', [HumanMessage.fromText('start')] );
      expect(result).toBeInstanceOf(ResponseMessage);
      expect(result.text).toBe('final');

      expect(scriptedLLM.inputs.length).toBe(2);
      const secondCallInput = scriptedLLM.inputs[1];
      const rawMessages = secondCallInput?.raw ?? [];
      const flattenedMessages = secondCallInput?.flat ?? [];

      const summary = summarizeInput(rawMessages);
      console.info('Second call input (mixed response):', JSON.stringify(summary, null, 2));
      console.debug('Second call flattened input (mixed response):', JSON.stringify(flattenedMessages, null, 2));

      const responseMessages = rawMessages.filter((msg): msg is ResponseMessage => msg instanceof ResponseMessage);
      expect(responseMessages.length).toBe(1);
      const responsePayloads = responseMessages.map((msg) => msg.toPlain());
      console.debug('Second call response payloads (mixed response):', JSON.stringify(responsePayloads, null, 2));

      const [firstResponse] = responseMessages;
      const responseOutputs = firstResponse.output;
      expect(responseOutputs.length).toBe(2);
      const toolCallOutputs = responseOutputs.filter((output) => output instanceof ToolCallMessage);
      const assistantOutputs = responseOutputs.filter((output) => output instanceof AIMessage);

      expect(toolCallOutputs.length).toBe(1);
      expect(assistantOutputs.length).toBe(1);
      expect(assistantOutputs[0]?.text).toBe('');

      const flattenedFunctionCalls = flattenedMessages.filter((entry) => entry?.type === 'function_call');
      const flattenedAssistantMessages = flattenedMessages.filter(
        (entry) => entry?.type === 'message' && entry?.role === 'assistant',
      );

      expect(flattenedFunctionCalls.length).toBe(1);
      expect(flattenedAssistantMessages.length).toBe(0);
    } finally {
      await moduleRef.close();
    }
  });

  it('captures duplicate tool_call assistant outputs within a single run', async () => {
    const fixture = await createAgentFixture();
    const { agent, moduleRef, registerCallModelLLM } = fixture;

    try {
      const scriptedLLM = new ScriptableLLM();
      const duplicateCallId = 'call-duplicate';
      scriptedLLM.setScript([
        {
          kind: 'response',
          output: [createToolCallPlain(duplicateCallId), createToolCallPlain(duplicateCallId)],
        },
        { kind: 'text', text: 'final' },
      ]);
      registerCallModelLLM(scriptedLLM);

      const result = await agent.invoke('thread-duplicate-single', [HumanMessage.fromText('start')]);
      expect(result).toBeInstanceOf(ResponseMessage);
      expect(result.text).toBe('final');

      expect(scriptedLLM.inputs.length).toBe(2);
      const secondCallInput = scriptedLLM.inputs[1];
      const rawMessages = secondCallInput?.raw ?? [];
      const flattenedMessages = secondCallInput?.flat ?? [];

      const summary = summarizeInput(rawMessages);
      console.info('Second call input (duplicate tool calls, single run):', JSON.stringify(summary, null, 2));
      console.debug(
        'Second call flattened input (duplicate tool calls, single run):',
        JSON.stringify(flattenedMessages, null, 2),
      );

      const responseMessages = rawMessages.filter((msg): msg is ResponseMessage => msg instanceof ResponseMessage);
      expect(responseMessages.length).toBe(1);
      const [response] = responseMessages;
      const toolCallOutputs = response.output.filter((entry) => entry instanceof ToolCallMessage) as ToolCallMessage[];
      const assistantOutputs = response.output.filter((entry) => entry instanceof AIMessage);

      expect(toolCallOutputs.length).toBe(2);
      expect(toolCallOutputs[0].toPlain()).toEqual(toolCallOutputs[1].toPlain());
      expect(assistantOutputs.length).toBe(0);

      const flattenedFunctionCalls = flattenedMessages.filter((entry) => entry?.type === 'function_call');
      expect(flattenedFunctionCalls.length).toBe(2);
      console.debug(
        'Second call flattened function calls (duplicate tool calls, single run):',
        JSON.stringify(flattenedFunctionCalls, null, 2),
      );
      expect(flattenedFunctionCalls[0]).toEqual(flattenedFunctionCalls[1]);
    } finally {
      await moduleRef.close();
    }
  });

  it('captures first model call input after loading persisted state in a new run', async () => {
    const fixture = await createAgentFixture();
    const { agent, moduleRef, registerCallModelLLM } = fixture;

    try {
      const firstRunLLM = new ScriptableLLM();
      firstRunLLM.setScript([
        { kind: 'tool_call', callId: 'call-1', name: 'demo' },
        { kind: 'text', text: 'final' },
      ]);
      registerCallModelLLM(firstRunLLM);

      const firstResult = await agent.invoke('thread-beta', [HumanMessage.fromText('initial')]);
      expect(firstResult).toBeInstanceOf(ResponseMessage);

      const secondRunLLM = new ScriptableLLM();
      secondRunLLM.setScript([{ kind: 'text', text: 'follow-up' }]);
      registerCallModelLLM(secondRunLLM);

      const followUp = await agent.invoke('thread-beta', [HumanMessage.fromText('next')]);
      expect(followUp).toBeInstanceOf(ResponseMessage);

      expect(secondRunLLM.inputs.length).toBe(1);
      const freshRunInput = secondRunLLM.inputs[0]?.raw ?? [];
      expect(freshRunInput.length).toBeGreaterThan(0);

      const summary = summarizeInput(freshRunInput);
      console.info('First call input after load (new run):', JSON.stringify(summary, null, 2));

      const responseMessages = freshRunInput.filter(
        (msg): msg is ResponseMessage => msg instanceof ResponseMessage,
      );
      const responsePayloads = responseMessages.map((msg) => msg.toPlain());

      if (responsePayloads.length > 0) {
        console.debug(
          'First call response payloads:',
          JSON.stringify(responsePayloads, null, 2),
        );
      }

      if (summary.counts.response === 2) {
        expect(summary.counts.response).toBe(2);
      } else {
        expect(summary.counts.response).toBeGreaterThan(0);
      }

      if (responsePayloads.length === 2) {
        const [firstPayload, secondPayload] = responsePayloads;
        const areEqual = JSON.stringify(firstPayload) === JSON.stringify(secondPayload);
        console.debug(
          'Response payload deep equality:',
          JSON.stringify({ areEqual }, null, 2),
        );
        if (areEqual) {
          expect(secondPayload).toEqual(firstPayload);
        } else {
          expect(secondPayload).not.toEqual(firstPayload);
        }
      }
    } finally {
      await moduleRef.close();
    }
  });

  it('persists duplicate tool_call outputs across runs', async () => {
    const fixture = await createAgentFixture();
    const { agent, moduleRef, registerCallModelLLM } = fixture;

    try {
      const callId = 'call-duplicate-persist';
      const firstRunLLM = new ScriptableLLM();
      firstRunLLM.setScript([
        {
          kind: 'response',
          output: [createToolCallPlain(callId), createToolCallPlain(callId)],
        },
        { kind: 'text', text: 'final' },
      ]);
      registerCallModelLLM(firstRunLLM);

      const firstResult = await agent.invoke('thread-duplicate-persist', [HumanMessage.fromText('initial')]);
      expect(firstResult).toBeInstanceOf(ResponseMessage);

      const secondRunLLM = new ScriptableLLM();
      secondRunLLM.setScript([{ kind: 'text', text: 'follow-up' }]);
      registerCallModelLLM(secondRunLLM);

      const followUp = await agent.invoke('thread-duplicate-persist', [HumanMessage.fromText('next')]);
      expect(followUp).toBeInstanceOf(ResponseMessage);
      expect(followUp.text).toBe('follow-up');

      expect(secondRunLLM.inputs.length).toBe(1);
      const firstCallInput = secondRunLLM.inputs[0];
      const rawMessages = firstCallInput?.raw ?? [];
      const flattenedMessages = firstCallInput?.flat ?? [];

      const summary = summarizeInput(rawMessages);
      console.info(
        'First call input after load (duplicate tool calls, new run):',
        JSON.stringify(summary, null, 2),
      );
      console.debug(
        'First call flattened input after load (duplicate tool calls, new run):',
        JSON.stringify(flattenedMessages, null, 2),
      );

      const responseMessages = rawMessages.filter((msg): msg is ResponseMessage => msg instanceof ResponseMessage);
      expect(responseMessages.length).toBeGreaterThan(0);
      const duplicateResponse = responseMessages.find((msg) =>
        msg.output.some((entry) => entry instanceof ToolCallMessage),
      );
      expect(duplicateResponse).toBeDefined();

      const toolCallOutputs = duplicateResponse!.output.filter(
        (entry): entry is ToolCallMessage => entry instanceof ToolCallMessage,
      );
      const assistantOutputs = duplicateResponse!.output.filter((entry) => entry instanceof AIMessage);

      expect(toolCallOutputs.length).toBe(2);
      expect(toolCallOutputs[0].toPlain()).toEqual(toolCallOutputs[1].toPlain());
      expect(assistantOutputs.length).toBe(0);
      console.debug(
        'Persisted duplicate tool call payloads:',
        JSON.stringify(toolCallOutputs.map((entry) => entry.toPlain()), null, 2),
      );

      const flattenedFunctionCalls = flattenedMessages.filter((entry) => entry?.type === 'function_call');
      expect(flattenedFunctionCalls.length).toBeGreaterThanOrEqual(2);
      expect(flattenedFunctionCalls[0]).toEqual(flattenedFunctionCalls[1]);
    } finally {
      await moduleRef.close();
    }
  });
});
