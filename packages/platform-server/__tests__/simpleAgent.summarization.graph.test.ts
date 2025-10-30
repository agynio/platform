import { describe, it, expect, vi } from 'vitest';
import { ResponseMessage, AIMessage, HumanMessage } from '@agyn/llm';
import { LoggerService } from '../src/core/services/logger.service';
import { Test } from '@nestjs/testing';
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


    const module = await Test.createTestingModule({
      providers: [
        LoggerService,
        { provide: ConfigService, useValue: new ConfigService({ githubAppId: '1', githubAppPrivateKey: 'k', githubInstallationId: 'i', openaiApiKey: 'x', githubToken: 't', mongodbUrl: 'm' }) },
        { provide: LLMProvisioner, useValue: provisioner },
        { provide: AgentRunService, useValue: runsStub },
        Agent,
      ],
    }).compile();

    const agent = module.get(Agent);
