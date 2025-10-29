import { describe, it, expect, vi } from 'vitest';
import { ResponseMessage, AIMessage, HumanMessage } from '@agyn/llm';
import { LoggerService } from '../src/core/services/logger.service';
import { ConfigService } from '../src/core/services/config.service';

import { AgentNode as Agent } from '../src/graph/nodes/agent/agent.node';
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';
import { AgentRunService } from '../src/graph/nodes/agentRun.repository';

// Mock Prisma client to avoid requiring generated client in tests
vi.mock('@prisma/client', () => ({ PrismaClient: class {} }));

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

    const logger = new LoggerService();
    const config = new ConfigService({ githubAppId: '1', githubAppPrivateKey: 'k', githubInstallationId: 'i', openaiApiKey: 'x', githubToken: 't', mongodbUrl: 'm' });
    const moduleRefStub = {
      create: async (Cls: any) => {
        const name = Cls?.name as string;
        if (name === 'SummarizationLLMReducer') return new Cls(provisioner as any);
        if (name === 'LoadLLMReducer') return new Cls(logger as any, { getClient: () => null } as any);
        if (name === 'SaveLLMReducer') return new Cls(logger as any, { getClient: () => null } as any);
        return new Cls();
      },
    } as any;
    const agent = new Agent(config as any, logger as any, provisioner as any, runsStub as any, moduleRefStub as any);
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
