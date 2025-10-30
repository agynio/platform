import { describe, it, expect } from 'vitest';
import { AgentNode, AgentStaticConfig } from '../src/graph/nodes/agent/agent.node';
import { MessagesBuffer } from '../src/graph/nodes/agent/messagesBuffer';
import { ThreadLockService } from '../src/graph/nodes/agent/threadLock.service';
import { LoggerService } from '../src/core/services/logger.service';
import { ConfigService } from '../src/core/services/config.service';
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';
import { ModuleRef } from '@nestjs/core';
import { Loop, Reducer } from '@agyn/llm';
import type { LLMContext, LLMState } from '../src/llm/types';
import { AIMessage, HumanMessage, ResponseMessage } from '@agyn/llm';

class NoopLogger extends LoggerService { constructor() { super(); } }
class DummyConfig extends ConfigService { constructor() { super(); } }
class DummyRuns {
  async startRun(): Promise<void> {}
  async markTerminated(): Promise<void> {}
  async list(): Promise<any[]> { return []; }
}

class TestAgent extends AgentNode {
  public bufferPublic(): MessagesBuffer { return (this as any).buffer as MessagesBuffer; }
  protected async prepareLoop(): Promise<Loop<LLMState, LLMContext>> {
    const reducerId = 'load';
    const reducers: Record<string, Reducer<LLMState, LLMContext>> = {};
    reducers[reducerId] = new (class extends Reducer<LLMState, LLMContext> {
      async invoke(state: LLMState, _ctx: LLMContext): Promise<LLMState> {
        const ai = AIMessage.fromText('ok');
        const resp = new ResponseMessage({ output: [ai.toPlain()] });
        return { ...state, messages: [...state.messages, resp] };
      }
    })();
    return new Loop<LLMState, LLMContext>(reducers);
  }
}

function makeAgent(config: Partial<AgentStaticConfig> = {}) {
  const logger = new NoopLogger();
  const cfg = new DummyConfig();
  const provisioner: LLMProvisioner = { getLLM: async () => { throw new Error('not used'); } } as LLMProvisioner;
  const runs = new DummyRuns() as any;
  const moduleRef = { create: async () => { throw new Error('not used'); } } as unknown as ModuleRef;
  const locks = new ThreadLockService();

  const a = new TestAgent(cfg as any, logger, provisioner, runs, locks, moduleRef);
  (a as any).init({ nodeId: 'agent-1' });
  (a as any)._config = {
    whenBusy: 'wait',
    processBuffer: 'allTogether',
    debounceMs: 0,
    model: 'test',
    systemPrompt: 'x',
    maxContinueIterations: 1,
    ...config,
  } as AgentStaticConfig;
  return a;
}

describe('Agent busy-mode serialization (wait)', () => {
  it('serializes concurrent invokes; second resolves after first', async () => {
    const agent = makeAgent({ whenBusy: 'wait', processBuffer: 'allTogether' });
    const t = 't-wait';

    const m1 = HumanMessage.fromText('m1');
    const m2 = HumanMessage.fromText('m2');

    const p1 = agent.invoke(t, [m1]);
    const p2 = agent.invoke(t, [m2]);

    const r1 = await p1;
    const r2 = await p2;

    expect(r1.text).toBe('ok');
    expect(r2.text).toBe('ok');
  });
});
