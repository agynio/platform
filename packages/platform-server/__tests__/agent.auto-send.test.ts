import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { Injectable } from '@nestjs/common';

import { AgentNode } from '../src/nodes/agent/agent.node';
import { configSchema, ConfigService } from '../src/core/services/config.service';
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';
import { RunSignalsRegistry } from '../src/agents/run-signals.service';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { ThreadTransportService } from '../src/messaging/threadTransport.service';

import { AIMessage, HumanMessage, Loop, Reducer, ResponseMessage, Router, ToolCallMessage } from '@agyn/llm';
import type { LLMContext, LLMState } from '../src/llm/types';

class PassThroughReducer extends Reducer<LLMState, LLMContext> {
  async invoke(state: LLMState): Promise<LLMState> {
    return state;
  }
}

class StaticResponseReducer extends Reducer<LLMState, LLMContext> {
  constructor(private readonly factory: () => ResponseMessage) {
    super();
  }

  async invoke(state: LLMState): Promise<LLMState> {
    const response = this.factory();
    return { ...state, messages: [...state.messages, response] };
  }
}

class NextRouter extends Router<LLMState, LLMContext> {
  constructor(private readonly nextId: string | null) {
    super();
  }

  async route(state: LLMState): Promise<{ state: LLMState; next: string | null }> {
    return { state, next: this.nextId };
  }
}

@Injectable()
class AutoSendTestAgentNode extends AgentNode {
  private responseFactory: () => ResponseMessage = () => new ResponseMessage({ output: [] });

  setResponseFactory(factory: () => ResponseMessage) {
    this.responseFactory = factory;
  }

  protected override async prepareLoop(_tools: unknown[], _effective: unknown): Promise<Loop<LLMState, LLMContext>> {
    const load = new PassThroughReducer();
    load.next(new NextRouter('call_model'));

    const callModel = new StaticResponseReducer(() => this.responseFactory());
    callModel.next(new NextRouter(null));

    return new Loop<LLMState, LLMContext>({
      load,
      call_model: callModel,
    });
  }
}

const createAgentFixture = async () => {
  let runCounter = 0;
  const beginRunThread = vi.fn(async () => ({ runId: `run-${++runCounter}` }));
  const completeRun = vi.fn(async () => undefined);
  const ensureThreadModel = vi.fn(async (_threadId: string, model: string) => model);
  const recordInjected = vi.fn(async () => ({ messageIds: [] }));
  const transport = { sendTextToThread: vi.fn().mockResolvedValue({ ok: true, threadId: 'thread-1' }) };

  const moduleRef = await Test.createTestingModule({
    providers: [
      {
        provide: ConfigService,
        useValue: new ConfigService().init(
          configSchema.parse({ llmProvider: 'openai', agentsDatabaseUrl: 'postgres://user:pass@host/db' }),
        ),
      },
      AutoSendTestAgentNode,
      { provide: AgentNode, useExisting: AutoSendTestAgentNode },
      RunSignalsRegistry,
      {
        provide: LLMProvisioner,
        useValue: { getLLM: vi.fn(async () => ({ call: vi.fn(async () => ({ text: 'ok' })) })) },
      },
      {
        provide: AgentsPersistenceService,
        useValue: {
          beginRunThread,
          completeRun,
          ensureThreadModel,
          recordInjected,
        },
      },
      { provide: ThreadTransportService, useValue: transport },
    ],
  }).compile();

  const agent = await moduleRef.resolve(AutoSendTestAgentNode);
  agent.init({ nodeId: 'agent-auto' });

  return {
    moduleRef,
    agent,
    transport,
    beginRunThread,
    completeRun,
    ensureThreadModel,
  };
};

describe('AgentNode auto-send final response', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('auto-sends terminal assistant responses by default', async () => {
    const { moduleRef, agent, transport } = await createAgentFixture();
    await agent.setConfig({});

    agent.setResponseFactory(() => new ResponseMessage({ output: [AIMessage.fromText('final reply').toPlain()] }));

    const result = await agent.invoke('thread-1', [HumanMessage.fromText('hello')]);
    expect(result).toBeInstanceOf(ResponseMessage);
    expect(transport.sendTextToThread).toHaveBeenCalledWith('thread-1', 'final reply', {
      runId: 'run-1',
      source: 'auto_response',
    });

    await moduleRef.close();
  });

  it('skips auto-send when the response includes pending tool calls', async () => {
    const { moduleRef, agent, transport } = await createAgentFixture();
    await agent.setConfig({});

    agent.setResponseFactory(
      () =>
        new ResponseMessage({
          output: [
            new ToolCallMessage({
              type: 'function_call',
              call_id: 'call-1',
              name: 'demo',
              arguments: JSON.stringify({ foo: 'bar' }),
            } as any).toPlain(),
          ],
        }),
    );

    const result = await agent.invoke('thread-2', [HumanMessage.fromText('hi again')]);
    expect(result).toBeInstanceOf(ResponseMessage);
    expect(transport.sendTextToThread).not.toHaveBeenCalled();

    await moduleRef.close();
  });

  it('honors sendFinalResponseToThread=false opt-out', async () => {
    const { moduleRef, agent, transport } = await createAgentFixture();
    await agent.setConfig({ sendFinalResponseToThread: false });

    agent.setResponseFactory(() => new ResponseMessage({ output: [AIMessage.fromText('final reply').toPlain()] }));

    const result = await agent.invoke('thread-3', [HumanMessage.fromText('ping')]);
    expect(result).toBeInstanceOf(ResponseMessage);
    expect(transport.sendTextToThread).not.toHaveBeenCalled();

    await moduleRef.close();
  });
});
