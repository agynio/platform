import 'reflect-metadata';

import { describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';

import { AgentNode } from '../src/nodes/agent/agent.node';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { RunSignalsRegistry } from '../src/agents/run-signals.service';
import { ConfigService, configSchema } from '../src/core/services/config.service';
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';
import { ThreadTransportService } from '../src/messaging/threadTransport.service';

import { HumanMessage, Loop, Reducer, ResponseMessage } from '@agyn/llm';
import type { LLMContext, LLMState } from '../src/llm/types';

class DelayReducer extends Reducer<LLMState, LLMContext> {
  override async invoke(state: LLMState): Promise<LLMState> {
    await new Promise((resolve) => setTimeout(resolve, 5));
    return state;
  }
}

class TerminationAutoSendAgent extends AgentNode {
  protected override async prepareLoop(): Promise<Loop<LLMState, LLMContext>> {
    return new Loop<LLMState, LLMContext>({ load: new DelayReducer() });
  }
}

describe('AgentNode termination auto-send', () => {
  it('auto-sends a termination message when run ends via terminate signal', async () => {
    const beginRunThread = vi.fn(async () => ({ runId: 'run-terminate' }));
    const completeRun = vi.fn(async () => undefined);
    const ensureThreadModel = vi.fn(async (_threadId: string, model: string) => model);
    const recordInjected = vi.fn(async () => ({ messageIds: [] }));
    const sendTextToThread = vi
      .fn()
      .mockResolvedValue({ ok: true, threadId: 'thread-terminate', error: undefined });

    const moduleRef = await Test.createTestingModule({
      providers: [
        {
          provide: ConfigService,
          useValue: new ConfigService().init(
            configSchema.parse({
              litellmBaseUrl: 'http://127.0.0.1:4000',
              litellmMasterKey: 'sk-dev-master-1234',
              agentsDatabaseUrl: 'postgres://user:pass@host/db',
            }),
          ),
        },
        {
          provide: LLMProvisioner,
          useValue: { getLLM: vi.fn(async () => ({ call: vi.fn(async () => ({ text: 'ok', output: [] })) })) },
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
        { provide: ThreadTransportService, useValue: { sendTextToThread } },
        RunSignalsRegistry,
        TerminationAutoSendAgent,
        { provide: AgentNode, useExisting: TerminationAutoSendAgent },
      ],
    }).compile();

    try {
      const agent = await moduleRef.resolve(TerminationAutoSendAgent);
      agent.init({ nodeId: 'agent-termination-auto' });
      await agent.setConfig({});

      const registry = moduleRef.get(RunSignalsRegistry);

      const invokePromise = agent.invoke('thread-terminate', [HumanMessage.fromText('start work')]);
      await new Promise((resolve) => setTimeout(resolve, 0));
      registry.activateTerminate('run-terminate');
      const result = await invokePromise;

      expect(result).toBeInstanceOf(ResponseMessage);
      expect(result.text).toBe('terminated');
      expect(sendTextToThread).toHaveBeenCalledWith(
        'thread-terminate',
        'terminated',
        expect.objectContaining({ runId: 'run-terminate', source: 'auto_response' }),
      );
      expect(completeRun).toHaveBeenCalledWith('run-terminate', 'terminated', []);
    } finally {
      await moduleRef.close();
    }
  });
});
