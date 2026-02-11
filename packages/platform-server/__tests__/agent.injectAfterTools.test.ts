import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { Injectable } from '@nestjs/common';

import { AgentNode } from '../src/nodes/agent/agent.node';
import { ConfigService, configSchema } from '../src/core/services/config.service';
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';
import { RunSignalsRegistry } from '../src/agents/run-signals.service';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';

import { AIMessage, HumanMessage, Loop, Reducer, ResponseMessage, Router } from '@agyn/llm';
import type { LLMContext, LLMState } from '../src/llm/types';

import { waitFor } from './helpers/ws';

class PassThroughReducer extends Reducer<LLMState, LLMContext> {
  async invoke(state: LLMState): Promise<LLMState> {
    return state;
  }
}

class StubCallModelReducer extends Reducer<LLMState, LLMContext> {
  static instances: StubCallModelReducer[] = [];

  calls: LLMState['messages'][] = [];

  constructor() {
    super();
    StubCallModelReducer.instances.push(this);
  }

  async invoke(state: LLMState): Promise<LLMState> {
    this.calls.push([...state.messages]);
    const response = new ResponseMessage({ output: [AIMessage.fromText('ok').toPlain()] });
    return { ...state, messages: [...state.messages, response] };
  }
}

class NextRouter extends Router<LLMState, LLMContext> {
  constructor(private readonly nextId: string) {
    super();
  }

  async route(state: LLMState, ctx: LLMContext): Promise<{ state: LLMState; next: string | null }> {
    if (ctx.terminateSignal.isActive) {
      return { state, next: null };
    }
    return { state, next: this.nextId };
  }
}

class EndRouter extends Router<LLMState, LLMContext> {
  async route(state: LLMState): Promise<{ state: LLMState; next: string | null }> {
    return { state, next: null };
  }
}

@Injectable()
class TestAgentNode extends AgentNode {
  protected override async prepareLoop(_tools: unknown[], effective: any): Promise<Loop<LLMState, LLMContext>> {
    const load = new PassThroughReducer();
    load.next(new NextRouter('call_tools'));

    const callTools = new PassThroughReducer();
    callTools.next(new NextRouter('tools_save'));

    const toolsSave = new PassThroughReducer();
    const agent = this;
    const behavior = effective?.behavior ?? {
      debounceMs: 0,
      whenBusy: 'wait',
      processBuffer: 'allTogether',
      restrictOutput: false,
      restrictionMessage: '',
      restrictionMaxInjections: 0,
    };
    class AfterToolsRouter extends Router<LLMState, LLMContext> {
      async route(state: LLMState, ctx: LLMContext): Promise<{ state: LLMState; next: string | null }> {
        if (ctx.finishSignal.isActive) {
          return { state, next: null };
        }
        if ((agent.config.whenBusy ?? 'wait') === 'injectAfterTools') {
          await (agent as unknown as {
            injectBufferedMessages(behavior: any, state: LLMState, ctx: LLMContext): Promise<void>;
          }).injectBufferedMessages(behavior, state, ctx);
        }
        return { state, next: 'call_model' };
      }
    }
    toolsSave.next(new AfterToolsRouter());

    const callModel = new StubCallModelReducer();
    callModel.next(new EndRouter());

    return new Loop<LLMState, LLMContext>({
      load,
      call_tools: callTools,
      tools_save: toolsSave,
      call_model: callModel,
    });
  }
}

const createAgentFixture = async () => {
  let runCounter = 0;
  const beginRunThread = vi.fn(async () => ({ runId: `run-${++runCounter}` }));
  const recordInjected = vi.fn(async () => ({ messageIds: [] }));
  const completeRun = vi.fn(async () => {});
  const getLLM = vi.fn(async () => ({ call: vi.fn(async () => ({ text: 'ok', output: [] })) }));
  const ensureThreadModel = vi.fn(async (_threadId: string, model: string) => model);

  const moduleRef = await Test.createTestingModule({
    providers: [
      {
        provide: ConfigService,
        useValue: new ConfigService().init(
          configSchema.parse({
            agentsDatabaseUrl: 'postgres://user:pass@host/db',
            litellmBaseUrl: 'http://localhost:4000',
            litellmMasterKey: 'sk-test',
          }),
        ),
      },
      TestAgentNode,
      RunSignalsRegistry,
      { provide: AgentNode, useExisting: TestAgentNode },
      { provide: LLMProvisioner, useValue: { getLLM } },
      {
        provide: AgentsPersistenceService,
        useValue: {
          beginRunThread,
          recordInjected,
          completeRun,
          ensureThreadModel,
        },
      },
    ],
  }).compile();

  const agent = await moduleRef.resolve(TestAgentNode);
  agent.init({ nodeId: 'agent-test' });

  return {
    moduleRef,
    agent,
    beginRunThread,
    recordInjected,
    completeRun,
    ensureThreadModel,
  };
};

const getCallModelInputs = () => StubCallModelReducer.instances.flatMap((instance) => instance.calls);

const extractHumanTexts = (messages: LLMState['messages']) =>
  messages.filter((msg): msg is HumanMessage => msg instanceof HumanMessage).map((msg) => msg.text);

describe('Agent injectAfterTools buffering', () => {
  beforeEach(() => {
    StubCallModelReducer.instances = [];
  });

  it('injects buffered messages before the next call_model when configured', async () => {
    const { moduleRef, agent, recordInjected } = await createAgentFixture();
    await agent.setConfig({ whenBusy: 'injectAfterTools', processBuffer: 'allTogether' });

    const primary = agent.invoke('thread-1', [HumanMessage.fromText('initial')]);
    const queued = agent.invoke('thread-1', [HumanMessage.fromText('followup-1'), HumanMessage.fromText('followup-2')]);

    const queuedResult = await queued;
    expect(queuedResult.text).toBe('queued');

    const result = await primary;
    expect(result).toBeInstanceOf(ResponseMessage);

    const callInputs = getCallModelInputs();
    expect(callInputs.length).toBe(1);
    expect(extractHumanTexts(callInputs[0])).toEqual(['initial', 'followup-1', 'followup-2']);

    expect(recordInjected).toHaveBeenCalledTimes(1);
    const injectedTexts = (recordInjected.mock.calls[0]?.[1] as HumanMessage[] | undefined)?.map((msg) => msg.text);
    expect(injectedTexts).toEqual(['followup-1', 'followup-2']);

    await moduleRef.close();
  });

  it('respects processBuffer oneByOne by deferring remaining messages to the next run', async () => {
    const { moduleRef, agent, recordInjected, completeRun } = await createAgentFixture();
    await agent.setConfig({ whenBusy: 'injectAfterTools', processBuffer: 'oneByOne' });

    const primary = agent.invoke('thread-2', [HumanMessage.fromText('seed')]);
    const queuedFirst = agent.invoke('thread-2', [HumanMessage.fromText('buffer-1')]);
    const queuedSecond = agent.invoke('thread-2', [HumanMessage.fromText('buffer-2')]);

    await queuedFirst;
    await queuedSecond;

    const result = await primary;
    expect(result).toBeInstanceOf(ResponseMessage);

    await waitFor(() => completeRun.mock.calls.length >= 2);

    const callInputs = getCallModelInputs();
    expect(callInputs.length).toBeGreaterThanOrEqual(2);
    expect(extractHumanTexts(callInputs[0])).toEqual(['seed', 'buffer-1']);
    expect(extractHumanTexts(callInputs[1])).toEqual(['buffer-2']);

    expect(recordInjected).toHaveBeenCalledTimes(1);
    const injectedTexts = (recordInjected.mock.calls[0]?.[1] as HumanMessage[] | undefined)?.map((msg) => msg.text);
    expect(injectedTexts).toEqual(['buffer-1']);

    await moduleRef.close();
  });

  it('keeps buffered messages for the next run when whenBusy=wait', async () => {
    const { moduleRef, agent, recordInjected, completeRun, beginRunThread } = await createAgentFixture();
    await agent.setConfig({ whenBusy: 'wait', processBuffer: 'allTogether' });

    const primary = agent.invoke('thread-3', [HumanMessage.fromText('start')]);
    const queued = agent.invoke('thread-3', [HumanMessage.fromText('held')]);

    await queued;
    const result = await primary;
    expect(result).toBeInstanceOf(ResponseMessage);

    await waitFor(() => beginRunThread.mock.calls.length >= 2);
    await waitFor(() => completeRun.mock.calls.length >= 2);

    const callInputs = getCallModelInputs();
    expect(callInputs.length).toBeGreaterThanOrEqual(2);
    expect(extractHumanTexts(callInputs[0])).toEqual(['start']);
    expect(extractHumanTexts(callInputs[1])).toEqual(['held']);

    expect(recordInjected).not.toHaveBeenCalled();

    await moduleRef.close();
  });
});
