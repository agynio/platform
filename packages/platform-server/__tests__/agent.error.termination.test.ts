import { describe, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { Reducer, Loop, HumanMessage } from '@agyn/llm';
import type { LLMContext, LLMState } from '../src/llm/types';
import { AgentNode } from '../src/nodes/agent/agent.node';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { ConfigService, configSchema } from '../src/core/services/config.service';
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';
import { RunSignalsRegistry } from '../src/agents/run-signals.service';

class ErrorReducer extends Reducer<LLMState, LLMContext> {
  override async invoke(): Promise<LLMState> {
    throw new Error('LLM failure');
  }
}

class ErrorAgentNode extends AgentNode {
  protected override async prepareLoop(): Promise<Loop<LLMState, LLMContext>> {
    return new Loop<LLMState, LLMContext>({ load: new ErrorReducer() });
  }
}

describe('AgentNode error termination handling', () => {
  it('completes run as terminated and emits status when reducers throw', async () => {
    const beginRunThread = vi.fn(async () => ({ runId: 'run-error' }));
    const runStatusChanged = vi.fn();
    const completeRun = vi.fn(async (_runId: string, status: string) => {
      runStatusChanged({ run: { id: 'run-error', status }, threadId: 'thread-1' });
    });

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
        { provide: LLMProvisioner, useValue: {} },
        {
          provide: AgentsPersistenceService,
          useValue: {
            beginRunThread,
            completeRun,
            recordInjected: vi.fn().mockResolvedValue({ messageIds: [] }),
            ensureThreadModel: vi.fn(async (_threadId: string, model: string) => model),
          },
        },
        RunSignalsRegistry,
        ErrorAgentNode,
      ],
    }).compile();

    const agent = await moduleRef.resolve(ErrorAgentNode);
    agent.setRuntimeContext({ nodeId: 'agent-test', get: () => undefined });
    await agent.setConfig({ whenBusy: 'wait' });

    await expect(agent.invoke('thread-1', [HumanMessage.fromText('hi')])).rejects.toThrow('LLM failure');

    expect(beginRunThread).toHaveBeenCalledTimes(1);
    expect(completeRun).toHaveBeenCalledWith('run-error', 'terminated', []);
    expect(runStatusChanged).toHaveBeenCalledWith(
      expect.objectContaining({ run: expect.objectContaining({ id: 'run-error', status: 'terminated' }) }),
    );
  });
});
