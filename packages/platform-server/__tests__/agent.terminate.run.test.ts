import { describe, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { AgentNode } from '../src/nodes/agent/agent.node';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { LoggerService } from '../src/core/services/logger.service.js';
import { ConfigService } from '../src/core/services/config.service';
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';
import { RunSignalsRegistry } from '../src/agents/run-signals.service';
import { Reducer, Loop, ResponseMessage, HumanMessage } from '@agyn/llm';
import type { LLMContext, LLMState } from '../src/llm/types';

class TestReducer extends Reducer<LLMState, LLMContext> {
  override async invoke(state: LLMState): Promise<LLMState> {
    await new Promise((resolve) => setTimeout(resolve, 0));
    return {
      ...state,
      messages: [...state.messages, ResponseMessage.fromText('loop')],
    };
  }
}

class TerminateAwareAgent extends AgentNode {
  protected override async prepareLoop(): Promise<Loop<LLMState, LLMContext>> {
    return new Loop<LLMState, LLMContext>({ load: new TestReducer() });
  }
}

describe('AgentNode termination flow', () => {
  it('completes run as terminated when terminate signal is activated mid-run', async () => {
    const beginRunThread = vi.fn(async () => ({ runId: 'run-terminate' }));
    const completeRun = vi.fn(async () => {});

    const module = await Test.createTestingModule({
      providers: [
        LoggerService,
        ConfigService,
        { provide: LLMProvisioner, useValue: {} },
        { provide: AgentsPersistenceService, useValue: { beginRunThread, completeRun, recordInjected: vi.fn() } },
        RunSignalsRegistry,
        TerminateAwareAgent,
      ],
    }).compile();

    const agent = await module.resolve(TerminateAwareAgent);
    await agent.setConfig({ whenBusy: 'wait' });
    agent.setRuntimeContext({ nodeId: 'agent-test', get: () => undefined });

    const registry = module.get(RunSignalsRegistry);

    const invokePromise = agent.invoke('thread-1', [HumanMessage.fromText('hi')]);
    // Signal termination while reducer is still running
    registry.activateTerminate('run-terminate');
    const result = await invokePromise;

    expect(result.text).toBe('terminated');
    expect(completeRun).toHaveBeenCalledWith('run-terminate', 'terminated', []);
    expect(beginRunThread).toHaveBeenCalledTimes(1);
  });
});
