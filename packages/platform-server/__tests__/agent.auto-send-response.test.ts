import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { Injectable } from '@nestjs/common';
import { AgentNode } from '../src/nodes/agent/agent.node';
import { ConfigService, configSchema } from '../src/core/services/config.service';
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';
import { RunSignalsRegistry } from '../src/agents/run-signals.service';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { ThreadOutboxService } from '../src/messaging/threadOutbox.service';
import { AIMessage, HumanMessage, Loop, Reducer, ResponseMessage, Router } from '@agyn/llm';
import type { LLMContext, LLMState } from '../src/llm/types';

class PassReducer extends Reducer<LLMState, LLMContext> {
  constructor(private readonly nextId: string | null = null) {
    super();
  }
  async invoke(state: LLMState, _ctx: LLMContext): Promise<LLMState> {
    return state;
  }
  next(router: Router<LLMState, LLMContext>): void {
    super.next(router);
  }
}

class ResponseReducer extends Reducer<LLMState, LLMContext> {
  async invoke(state: LLMState): Promise<LLMState> {
    const response = new ResponseMessage({
      output: [AIMessage.fromText('final output').toPlain()],
      text: 'final output',
    });
    return { ...state, messages: [...state.messages, response] };
  }
}

class EndRouter extends Router<LLMState, LLMContext> {
  async route(state: LLMState): Promise<{ state: LLMState; next: string | null }> {
    return { state, next: null };
  }
}

@Injectable()
class AutoSendTestAgent extends AgentNode {
  protected override async prepareLoop(): Promise<Loop<LLMState, LLMContext>> {
    const load = new PassReducer('respond');
    const respond = new ResponseReducer();
    respond.next(new EndRouter());
    load.next(new (class extends Router<LLMState, LLMContext> {
      async route(state: LLMState): Promise<{ state: LLMState; next: string | null }> {
        return { state, next: 'respond' };
      }
    })());
    return new Loop({ load, respond });
  }
}

const buildModule = async () => {
  const beginRunThread = vi.fn(async () => ({ runId: 'run-1' }));
  const completeRun = vi.fn(async () => {});
  const ensureThreadModel = vi.fn(async (_threadId: string, model: string) => model);
  const recordInjected = vi.fn(async () => ({ messageIds: [] }));
  const outboxSend = vi.fn(async () => ({ ok: true }));

  const moduleRef = await Test.createTestingModule({
    providers: [
      {
        provide: ConfigService,
        useValue: new ConfigService().init(
          configSchema.parse({ llmProvider: 'openai', agentsDatabaseUrl: 'postgres://user:pass@localhost/db' }),
        ),
      },
      AutoSendTestAgent,
      RunSignalsRegistry,
      { provide: AgentNode, useExisting: AutoSendTestAgent },
      { provide: LLMProvisioner, useValue: { getLLM: vi.fn() } },
      {
        provide: AgentsPersistenceService,
        useValue: { beginRunThread, completeRun, ensureThreadModel, recordInjected },
      },
      {
        provide: ThreadOutboxService,
        useValue: { send: outboxSend },
      },
    ],
  }).compile();

  const agent = await moduleRef.resolve(AutoSendTestAgent);
  agent.init({ nodeId: 'agent-auto' });

  return { agent, beginRunThread, completeRun, ensureThreadModel, recordInjected, outboxSend };
};

describe('AgentNode auto-response outbox integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends final response via outbox when enabled', async () => {
    const { agent, completeRun, outboxSend } = await buildModule();
    await agent.setConfig({ model: 'gpt-test', sendLLMResponseToThread: true });
    const result = await agent.invoke('thread-1', [HumanMessage.fromText('hi')]);
    expect(result).toBeInstanceOf(ResponseMessage);
    expect(outboxSend).toHaveBeenCalledTimes(1);
    expect(outboxSend).toHaveBeenCalledWith({
      threadId: 'thread-1',
      text: 'final output',
      source: 'auto_response',
      runId: 'run-1',
    });
    expect(completeRun).toHaveBeenCalledTimes(1);
    expect(completeRun).toHaveBeenCalledWith('run-1', 'finished', []);
  });

  it('skips outbox when disabled and persists response via completeRun', async () => {
    const { agent, completeRun, outboxSend } = await buildModule();
    await agent.setConfig({ model: 'gpt-test', sendLLMResponseToThread: false });
    const result = await agent.invoke('thread-2', [HumanMessage.fromText('hello')]);
    expect(result).toBeInstanceOf(ResponseMessage);
    expect(outboxSend).not.toHaveBeenCalled();
    expect(completeRun).toHaveBeenCalledTimes(1);
    const [, , outputs] = completeRun.mock.calls[0];
    expect(outputs).toHaveLength(1);
    expect(outputs[0]).toBeInstanceOf(AIMessage);
  });
});
