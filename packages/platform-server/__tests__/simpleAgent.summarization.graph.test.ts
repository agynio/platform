import { describe, it, expect } from 'vitest';
import { ResponseMessage, AIMessage, HumanMessage } from '@agyn/llm';
import { LoggerService } from '../src/core/services/logger.service';
import { ConfigService, configSchema } from '../src/core/services/config.service';

import { AgentNode as Agent } from '../src/nodes/agent/agent.node';
import { Test } from '@nestjs/testing';
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';
import { PrismaService } from '../src/core/services/prisma.service';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { RunEventsService } from '../src/events/run-events.service';
import { createRunEventsStub } from './helpers/runEvents.stub';
import { RunSignalsRegistry } from '../src/agents/run-signals.service';

describe('Agent summarization graph', () => {
  it('invokes successfully over several turns with summarization configured', async () => {
    const provisioner = { getLLM: async () => ({ call: async () => new ResponseMessage({ output: [AIMessage.fromText('ok').toPlain()] }) }) };

    const module = await Test.createTestingModule({
      providers: [
        LoggerService,
        {
          provide: ConfigService,
          useValue: new ConfigService().init(
            configSchema.parse({
              llmProvider: 'openai',
              agentsDatabaseUrl: 'postgres://localhost/agents',
            }),
          ),
        },
        { provide: LLMProvisioner, useValue: provisioner },
        Agent,
        { provide: PrismaService, useValue: { getClient: () => ({ conversationState: { upsert: async () => {}, findUnique: async () => null } }) } },
        {
          provide: AgentsPersistenceService,
          useValue: {
            beginRunThread: async () => ({ runId: 't' }),
            recordInjected: async () => ({ messageIds: [] }),
            completeRun: async () => {},
          },
        },
        { provide: RunEventsService, useValue: createRunEventsStub() },
        RunSignalsRegistry,
      ],
    }).compile();

    const agent = await module.resolve(Agent);
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
