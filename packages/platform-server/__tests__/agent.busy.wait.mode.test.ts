
import { describe, it, expect } from 'vitest';
import { Test } from '@nestjs/testing';
import { LoggerService } from '../src/core/services/logger.service';
import { ConfigService } from '../src/core/services/config.service';
import { AgentNode } from '../src/graph/nodes/agent/agent.node';
import { AIMessage, HumanMessage, ResponseMessage } from '@agyn/llm';
import { Loop, Reducer } from '@agyn/llm';
import type { LLMContext, LLMState } from '../src/llm/types';
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';

class PassthroughReducer extends Reducer<LLMState, LLMContext> {
  async invoke(state: LLMState): Promise<LLMState> {
    return { ...state, messages: [...state.messages, new ResponseMessage({ output: [AIMessage.fromText('done').toPlain()] })] };
  }
}

class NoToolAgent extends AgentNode {
  starts = 0;
  protected override async prepareLoop(): Promise<Loop<LLMState, LLMContext>> {
    this.starts += 1;
    return new Loop<LLMState, LLMContext>({ load: new PassthroughReducer() });
  }
}

describe('Agent busy gating (wait mode)', () => {
  it('does not start a new loop while running; schedules next after finish', async () => {
    const module = await Test.createTestingModule({
      providers: [LoggerService, ConfigService, { provide: LLMProvisioner, useValue: {} }, NoToolAgent, { provide: AgentsPersistenceService, useValue: { beginRunThread: async () => ({ runId: 't' }), recordInjected: async () => {}, completeRun: async () => {} } }],
    }).compile();
    const agent = await module.resolve(NoToolAgent);
    await agent.setConfig({ whenBusy: 'wait' });
    agent.init({ nodeId: 'A1' });

    const p1 = agent.invoke('t', [HumanMessage.fromText('m1')]);
    // Immediately enqueue another message; should not start a second run now
    const p2 = agent.invoke('t', [HumanMessage.fromText('m2')]);
    const r2 = await p2; // queued response
    expect(agent.starts).toBe(1);
    expect(r2.text).toBe('queued');
    const r1 = await p1; // first run completes
    expect(r1.text).toBe('done');

    await new Promise((r) => setTimeout(r, 50));
    expect(agent.starts).toBeGreaterThanOrEqual(2);
  });
});
