import { describe, it, expect, vi } from 'vitest';
import { AgentNode, InjectQueuedReducer } from '../src/nodes/agent/agent.node';
import { HumanMessage, ResponseMessage, SystemMessage, ToolCallOutputMessage } from '@agyn/llm';
import type { LLMContext, LLMMessage, LLMState } from '../src/llm/types';
import { Signal } from '../src/signal';
import type { BufferMessage } from '../src/nodes/agent/messagesBuffer';
import { StaticLLMRouter } from '../src/llm/routers/static.llm.router';
import { Loop, Reducer } from '@agyn/llm';
import type { ConfigService } from '../src/core/services/config.service';
import type { LoggerService } from '../src/core/services/logger.service';
import type { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';
import type { ModuleRef } from '@nestjs/core';
import type { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import type { RunSignalsRegistry } from '../src/agents/run-signals.service';

describe('InjectQueuedReducer', () => {
  const baseContext = (): LLMContext => ({
    threadId: 'thread-1',
    runId: 'run-1',
    finishSignal: new Signal(),
    terminateSignal: new Signal(),
    callerAgent: {} as AgentNode,
  });

  it('drains queued messages and persists system injections', async () => {
    const systemMsg = SystemMessage.fromText('reminder');
    const followUp = HumanMessage.fromText('hi again');
    const drain = vi.fn().mockReturnValue([systemMsg, followUp]);
    const persist = vi.fn().mockResolvedValue(undefined);
    const agentStub = {
      config: { whenBusy: 'injectAfterTools', processBuffer: 'allTogether' },
      drainQueuedMessagesForInjection: drain,
      persistInjectedSystemMessages: persist,
    } satisfies Partial<AgentNode>;

    const reducer = new InjectQueuedReducer(agentStub as AgentNode);
    const initialState: LLMState = {
      messages: [ToolCallOutputMessage.fromResponse('call-1', 'ok')],
      context: { messageIds: [], memory: [] },
    };

    const next = await reducer.invoke(initialState, baseContext());

    expect(drain).toHaveBeenCalledWith('thread-1');
    expect(next.messages).toHaveLength(3);
    expect(next.messages.slice(-2)).toEqual([systemMsg, followUp]);
    expect(persist).toHaveBeenCalledWith('run-1', [systemMsg]);
  });

  it('skips draining when mode is wait or queue empty', async () => {
    const drain = vi.fn();
    const persist = vi.fn();
    const agentStub = {
      config: { whenBusy: 'wait', processBuffer: 'allTogether' },
      drainQueuedMessagesForInjection: drain,
      persistInjectedSystemMessages: persist,
    } satisfies Partial<AgentNode>;

    const reducer = new InjectQueuedReducer(agentStub as AgentNode);
    const state: LLMState = { messages: [], context: { messageIds: [], memory: [] } };

    const result = await reducer.invoke(state, baseContext());

    expect(result).toBe(state);
    expect(drain).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();

    drain.mockReturnValue([]);
    const injectionAgent = {
      config: { whenBusy: 'injectAfterTools', processBuffer: 'allTogether' },
      drainQueuedMessagesForInjection: drain,
      persistInjectedSystemMessages: persist,
    } satisfies Partial<AgentNode>;
    const withInjectionMode = new InjectQueuedReducer(injectionAgent as AgentNode);
    const noQueued = await withInjectionMode.invoke(state, baseContext());

    expect(noQueued).toBe(state);
    expect(persist).not.toHaveBeenCalled();
  });
});

class BufferHarnessAgent extends AgentNode {
  constructor(
    configService: ConfigService,
    logger: LoggerService,
    llmProvisioner: LLMProvisioner,
    moduleRef: ModuleRef,
    persistence: AgentsPersistenceService,
    runSignals: RunSignalsRegistry,
  ) {
    super(configService, logger, llmProvisioner, moduleRef, persistence, runSignals);
  }

  enqueue(thread: string, msgs: BufferMessage[], now = Date.now()): void {
    this.buffer.enqueue(thread, msgs, now);
  }

  syncDebounce(): void {
    this.buffer.setDebounceMs(this.config.debounceMs ?? 0);
  }
}

async function createBufferAgent(config: { processBuffer?: 'allTogether' | 'oneByOne'; debounceMs?: number }) {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as LoggerService;
  const moduleRef = { create: vi.fn(), get: vi.fn() } as unknown as ModuleRef;
  const persistence = {
    beginRunThread: vi.fn(),
    recordInjected: vi.fn(),
    completeRun: vi.fn(),
  } as unknown as AgentsPersistenceService;
  const runSignals = { register: vi.fn(), clear: vi.fn() } as unknown as RunSignalsRegistry;

  const agent = new BufferHarnessAgent(
    {} as ConfigService,
    logger,
    { getLLM: vi.fn() } as unknown as LLMProvisioner,
    moduleRef,
    persistence,
    runSignals,
  );
  agent.init({ nodeId: 'buffer-agent' });
  await agent.setConfig({
    whenBusy: 'injectAfterTools',
    processBuffer: config.processBuffer ?? 'allTogether',
    debounceMs: config.debounceMs ?? 0,
  });
  agent.syncDebounce();
  return agent;
}

describe('Agent buffer injection draining', () => {
  it('respects processBuffer=oneByOne when draining', async () => {
    const agent = await createBufferAgent({ processBuffer: 'oneByOne' });
    agent.enqueue('thread-a', [HumanMessage.fromText('m1'), HumanMessage.fromText('m2')], 0);

    const drained = agent.drainQueuedMessagesForInjection('thread-a', 10);
    expect(drained).toHaveLength(1);
    expect(drained[0]?.text).toBe('m1');
  });

  it('respects processBuffer=allTogether when draining', async () => {
    const agent = await createBufferAgent({ processBuffer: 'allTogether' });
    agent.enqueue('thread-b', [HumanMessage.fromText('m1'), HumanMessage.fromText('m2')], 0);

    const drained = agent.drainQueuedMessagesForInjection('thread-b', 10);
    expect(drained).toHaveLength(2);
    expect(drained.map((m) => m.text)).toEqual(['m1', 'm2']);
  });

  it('respects debounce window', async () => {
    const agent = await createBufferAgent({ debounceMs: 100 });
    agent.enqueue('thread-c', [HumanMessage.fromText('msg')], 0);

    expect(agent.drainQueuedMessagesForInjection('thread-c', 50)).toHaveLength(0);
    const drained = agent.drainQueuedMessagesForInjection('thread-c', 150);
    expect(drained).toHaveLength(1);
    expect(drained[0]?.text).toBe('msg');
  });
});

class InstrumentedAgent extends AgentNode {
  capturedMessages: LLMMessage[] = [];

  constructor(
    configService: ConfigService,
    logger: LoggerService,
    llmProvisioner: LLMProvisioner,
    moduleRef: ModuleRef,
    persistence: AgentsPersistenceService,
    runSignals: RunSignalsRegistry,
    private readonly order: string[],
    private readonly queuedMessage: SystemMessage,
  ) {
    super(configService, logger, llmProvisioner, moduleRef, persistence, runSignals);
  }

  enqueueDuringTool(thread: string, messages: BufferMessage[]): void {
    this.buffer.enqueue(thread, messages);
  }

  captureMessagesBeforeSummarize(messages: LLMMessage[]): void {
    this.capturedMessages = [...messages];
  }

  protected override async prepareLoop(): Promise<Loop<LLMState, LLMContext>> {
    const reducers: Record<string, Reducer<LLMState, LLMContext>> = {};

    const load = new PassthroughReducer().next(new StaticLLMRouter().init('call_tools'));
    reducers['load'] = load;

    const callTools = new ToolSimulationReducer(this, this.order, this.queuedMessage).next(
      new StaticLLMRouter().init('inject_queued'),
    );
    reducers['call_tools'] = callTools;

    const inject = new InjectQueuedReducer(this);
    inject.next(new StaticLLMRouter().init('tools_save'));
    reducers['inject_queued'] = inject;

    const save = new PassthroughReducer().next(new StaticLLMRouter().init('summarize'));
    reducers['tools_save'] = save;

    const summarize = new SummarizeReducer(this.order, (state) => this.captureMessagesBeforeSummarize(state.messages));
    reducers['summarize'] = summarize;

    return new Loop(reducers);
  }
}

class PassthroughReducer extends Reducer<LLMState, LLMContext> {
  async invoke(state: LLMState): Promise<LLMState> {
    return state;
  }
}

class ToolSimulationReducer extends Reducer<LLMState, LLMContext> {
  constructor(
    private readonly agent: InstrumentedAgent,
    private readonly order: string[],
    private readonly queuedMessage: SystemMessage,
  ) {
    super();
  }

  async invoke(state: LLMState, ctx: LLMContext): Promise<LLMState> {
    this.order.push('tool_execution');
    this.agent.enqueueDuringTool(ctx.threadId, [this.queuedMessage]);
    const toolResult = ToolCallOutputMessage.fromResponse('tool-1', 'success');
    return { ...state, messages: [...state.messages, toolResult], context: state.context };
  }
}

class SummarizeReducer extends Reducer<LLMState, LLMContext> {
  constructor(private readonly order: string[], private readonly onCapture: (state: LLMState) => void) {
    super();
  }

  async invoke(state: LLMState): Promise<LLMState> {
    this.order.push('summarization');
    this.onCapture(state);
    const response = ResponseMessage.fromText('final response');
    return { ...state, messages: [...state.messages, response], context: state.context };
  }
}

describe('Agent injectAfterTools integration', () => {
  it('injects queued system messages immediately after tool execution', async () => {
    const order: string[] = [];
    const queuedMessage = SystemMessage.fromText('queued reminder');
    const recordedInjections: SystemMessage[][] = [];

    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as LoggerService;
    const moduleRef = { create: vi.fn(), get: vi.fn() } as unknown as ModuleRef;
    const runSignals = { register: vi.fn(), clear: vi.fn() } as unknown as RunSignalsRegistry;
    const persistence = {
      beginRunThread: vi.fn(async () => ({ runId: 'run-42' })),
      recordInjected: vi.fn(async (_runId: string, messages: SystemMessage[]) => {
        order.push('injection');
        recordedInjections.push(messages);
      }),
      completeRun: vi.fn(async () => {}),
    } as unknown as AgentsPersistenceService;

    const agent = new InstrumentedAgent(
      {} as ConfigService,
      logger,
      { getLLM: vi.fn() } as unknown as LLMProvisioner,
      moduleRef,
      persistence,
      runSignals,
      order,
      queuedMessage,
    );

    agent.init({ nodeId: 'instrumented-agent' });
    await agent.setConfig({ whenBusy: 'injectAfterTools', processBuffer: 'allTogether', debounceMs: 0 });

    const result = await agent.invoke('thread-int', [HumanMessage.fromText('start')] );

    expect(order).toEqual(['tool_execution', 'injection', 'summarization']);
    expect(persistence.recordInjected).toHaveBeenCalledOnce();
    expect(recordedInjections).toHaveLength(1);
    expect(recordedInjections[0]).toHaveLength(1);
    expect(recordedInjections[0]?.[0]).toBe(queuedMessage);
    expect(agent.capturedMessages).toHaveLength(3);
    expect(agent.capturedMessages[0]).toBeInstanceOf(HumanMessage);
    expect(agent.capturedMessages[1]).toBeInstanceOf(ToolCallOutputMessage);
    expect(agent.capturedMessages[2]).toBe(queuedMessage);
    expect(result).toBeInstanceOf(ResponseMessage);
    expect(result.text).toBe('final response');
  });
});
