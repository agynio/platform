import { describe, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { LoggerService } from '../src/core/services/logger.service.js';
import { ConfigService } from '../src/core/services/config.service';
import { ModuleRef } from '@nestjs/core';
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { AgentNode } from '../src/nodes/agent/agent.node';
import { HumanMessage } from '@agyn/llm';
import { AgentsThreadsController } from '../src/agents/threads.controller';
import { ContainerThreadTerminationService } from '../src/infra/container/containerThreadTermination.service';
import { RunEventsService } from '../src/events/run-events.service';
import { RunSignalsRegistry } from '../src/agents/run-signals.service';

class StubLLMProvisioner extends LLMProvisioner {
  async getLLM(): Promise<{ call: (messages: unknown) => Promise<{ text: string; output: unknown[] }> }> {
    return { call: async () => ({ text: 'ok', output: [] }) };
  }
}

describe('Fail-fast behavior', () => {
  it('AgentNode.invoke propagates persistence beginRun error', async () => {
    const module = await Test.createTestingModule({
      providers: [
        LoggerService,
        ConfigService,
        { provide: LLMProvisioner, useClass: StubLLMProvisioner },
        AgentNode,
        {
          provide: AgentsPersistenceService,
          useValue: {
            beginRunThread: async () => { throw new Error('persistence_fail'); },
            recordInjected: async () => ({ messageIds: [] }),
            completeRun: async () => {},
          },
        },
        { provide: RunSignalsRegistry, useValue: { register: vi.fn(), activateTerminate: vi.fn(), clear: vi.fn() } },
      ],
    }).compile();

    const logger = module.get(LoggerService);
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const agent = await module.resolve(AgentNode);
    await agent.setConfig({});
    agent.setRuntimeContext({ nodeId: 'A', get: (_id: string) => undefined });

    await expect(agent.invoke('thread-1', [HumanMessage.fromText('hi')])).rejects.toBeTruthy();
    expect(spy).toHaveBeenCalled();
  });

  it('AgentsThreadsController.listThreads bubbles persistence errors as 500', async () => {
    const module = await Test.createTestingModule({
      controllers: [AgentsThreadsController],
      providers: [
        {
          provide: RunEventsService,
          useValue: {
            getRunSummary: async () => ({
              status: 'unknown',
              totalEvents: 0,
              firstEventAt: null,
              lastEventAt: null,
              countsByType: {
                invocation_message: 0,
                injection: 0,
                llm_call: 0,
                tool_execution: 0,
                summarization: 0,
              },
            }),
            listRunEvents: async () => ({ items: [], nextCursor: null }),
            getEventSnapshot: async () => null,
            publishEvent: async () => null,
          },
        },
        {
          provide: AgentsPersistenceService,
          useValue: {
            listThreads: async () => { throw new Error('db_fail'); },
            listRuns: async () => [],
            listRunMessages: async () => [],
          },
        },
        { provide: ContainerThreadTerminationService, useValue: { terminateByThread: vi.fn() } },
        { provide: RunSignalsRegistry, useValue: { register: vi.fn(), activateTerminate: vi.fn(), clear: vi.fn() } },
      ],
    }).compile();

    const ctrl = await module.resolve(AgentsThreadsController);
    await expect(ctrl.listThreads({} as any)).rejects.toBeTruthy();
  });
});
