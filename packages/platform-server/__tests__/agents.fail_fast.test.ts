import { describe, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { LoggerService } from '../src/core/services/logger.service.js';
import { ConfigService } from '../src/core/services/config.service';
import { ModuleRef } from '@nestjs/core';
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { AgentNode } from '../src/graph/nodes/agent/agent.node';
import { HumanMessage } from '@agyn/llm';
import { AgentsThreadsController } from '../src/agents/threads.controller';

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
            recordInjected: async () => {},
            completeRun: async () => {},
          },
        },
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
          provide: AgentsPersistenceService,
          useValue: {
            listThreads: async () => { throw new Error('db_fail'); },
            listRuns: async () => [],
            listRunMessages: async () => [],
          },
        },
      ],
    }).compile();

    const ctrl = await module.resolve(AgentsThreadsController);
    await expect(ctrl.listThreads({} as any)).rejects.toBeTruthy();
  });
});
