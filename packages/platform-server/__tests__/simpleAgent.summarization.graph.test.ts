import { describe, it, expect } from 'vitest';
import { ResponseMessage, AIMessage, HumanMessage } from '@agyn/llm';
import { LoggerService } from '../src/core/services/logger.service';
import { ConfigService } from '../src/core/services/config.service';

import { AgentNode as Agent } from '../src/graph/nodes/agent/agent.node';
import { Test } from '@nestjs/testing';
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';
import { AgentRunService } from '../src/graph/nodes/agentRun.repository';
import { ThreadRunCoordinatorService } from '../src/graph/nodes/agent/threadRunCoordinator.service';

describe('Agent summarization graph', () => {
  it('invokes successfully over several turns with summarization configured', async () => {
    const provisioner = { getLLM: async () => ({ call: async () => new ResponseMessage({ output: [AIMessage.fromText('ok').toPlain()] }) }) };
    const runsStub: AgentRunService = {
      ensureIndexes: async () => {},
      startRun: async () => {},
      markTerminating: async () => 'not_running',
      markTerminated: async () => {},
      clear: async () => {},
      list: async () => [],
      findByRunId: async () => null,
    } as AgentRunService;

    const module = await Test.createTestingModule({
      providers: [
        LoggerService,
        { provide: ConfigService, useValue: new ConfigService({ githubAppId: '1', githubAppPrivateKey: 'k', githubInstallationId: 'i', openaiApiKey: 'x', githubToken: 't', mongodbUrl: 'm' }) },
        { provide: LLMProvisioner, useValue: provisioner },
        { provide: AgentRunService, useValue: runsStub },
        ThreadRunCoordinatorService,
        Agent,
      ],
    }).compile();

    const agent = module.get(Agent);
    agent.init({ nodeId: 'agent-1' });
    await agent.setConfig({ summarizationKeepTokens: 2, summarizationMaxTokens: 200 });

    const msg = (text: string) => HumanMessage.fromText(text);
    const r1 = await agent.invoke('t', [msg('hi')]);
    const r2 = await agent.invoke('t', [msg('there')]);
    const r3 = await agent.invoke('t', [msg('friend')]);

    expect(r1).toBeDefined();
    expect(r2).toBeDefined();
    expect(r3).toBeDefined();
  });
});
