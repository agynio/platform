
import { describe, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { LoggerService } from '../src/core/services/logger.service';
import { ConfigService, configSchema } from '../src/core/services/config.service';
import { AgentNode } from '../src/nodes/agent/agent.node';
import { AIMessage, HumanMessage, ResponseMessage } from '@agyn/llm';
import { Loop, Reducer } from '@agyn/llm';
import type { LLMContext, LLMState } from '../src/llm/types';
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { RunSignalsRegistry } from '../src/agents/run-signals.service';

class PassthroughReducer extends Reducer<LLMState, LLMContext> {
  async invoke(state: LLMState): Promise<LLMState> {
    await new Promise((resolve) => setTimeout(resolve, 5));
    return {
      ...state,
      messages: [...state.messages, new ResponseMessage({ output: [AIMessage.fromText('done').toPlain()] })],
      context: state.context,
    };
  }
}

class NoToolAgent extends AgentNode {
  starts = 0;
  protected override async prepareLoop(_tools: unknown[], _effective: any): Promise<Loop<LLMState, LLMContext>> {
    this.starts += 1;
    return new Loop<LLMState, LLMContext>({ load: new PassthroughReducer() });
  }
}

describe('Agent busy gating (wait mode)', () => {
  it('does not start a new loop while running; schedules next after finish', async () => {
    const beginRunThread = vi.fn(async () => ({ runId: 't' }));
    const completeRun = vi.fn(async () => {});

    const module = await Test.createTestingModule({
      providers: [
        LoggerService,
        {
          provide: ConfigService,
          useValue: new ConfigService().init(
            configSchema.parse({ llmProvider: 'openai', agentsDatabaseUrl: 'postgres://user:pass@host/db' }),
          ),
        },
        { provide: LLMProvisioner, useValue: {} },
        NoToolAgent,
        {
          provide: AgentsPersistenceService,
          useValue: {
            beginRunThread,
            recordInjected: async () => ({ messageIds: [] }),
            completeRun,
            ensureThreadModel: async (_threadId: string, model: string) => model,
          },
        },
        RunSignalsRegistry,
      ],
    }).compile();
    const agent = await module.resolve(NoToolAgent);
    await agent.setConfig({ whenBusy: 'wait' });
    agent.init({ nodeId: 'A1' });

    const p1 = agent.invoke('t', [HumanMessage.fromText('m1')]);
    // Immediately enqueue another message; should not start a second run now
    const p2 = agent.invoke('t', [HumanMessage.fromText('m2')]);
    const r2 = await p2; // queued response
    expect(beginRunThread).toHaveBeenCalledTimes(1);
    expect(r2.text).toBe('queued');
    const r1 = await p1; // first run completes
    expect(r1.text).toBe('done');

    await new Promise((r) => setTimeout(r, 20));
    expect(beginRunThread).toHaveBeenCalledTimes(2);
  });
});
