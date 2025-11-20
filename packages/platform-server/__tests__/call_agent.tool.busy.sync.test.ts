
import { describe, it, expect } from 'vitest';
import { Test } from '@nestjs/testing';
import { LoggerService } from '../src/core/services/logger.service';
import { ConfigService } from '../src/core/services/config.service';
import { AgentNode } from '../src/nodes/agent/agent.node';
import { ResponseMessage, AIMessage } from '@agyn/llm';
import { CallAgentNode } from '../src/nodes/tools/call_agent/call_agent.node';
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { RunSignalsRegistry } from '../src/agents/run-signals.service';
import { Signal } from '../src/signal';
import { CallAgentLinkingService } from '../src/agents/call-agent-linking.service';

class BusyAgent extends AgentNode {
  override async invoke(): Promise<ResponseMessage> {
    return new ResponseMessage({ output: [AIMessage.fromText('queued').toPlain()] });
  }
}

describe('call_agent sync busy', () => {
  it('returns queued when target thread running (sync)', async () => {
    const module = await Test.createTestingModule({
      providers: [
        LoggerService,
        ConfigService,
        BusyAgent,
        { provide: LLMProvisioner, useValue: {} },
        {
          provide: AgentsPersistenceService,
          useValue: {
            beginRunThread: async () => ({ runId: 't' }),
            recordInjected: async () => ({ messageIds: [] }),
            completeRun: async () => {},
            getOrCreateSubthreadByAlias: async (_src: string, _alias: string, _parent: string, _summary: string) => 'child-t',
          },
        },
        RunSignalsRegistry,
      ],
    }).compile();
    const agent = await module.resolve(BusyAgent);
    await agent.setConfig({});
    agent.init({ nodeId: 'caller' });
    const linkingStub = {
      registerParentToolExecution: async () => undefined,
      buildInitialMetadata: () => ({
        tool: 'call_agent',
        parentThreadId: 'caller-t',
        childThreadId: 'child-t',
        childRun: { id: null, status: 'queued', linkEnabled: false, latestMessageId: null },
        childRunId: null,
        childRunStatus: 'queued',
        childRunLinkEnabled: false,
        childMessageId: null,
      }),
      onChildRunStarted: async () => null,
      onChildRunMessage: async () => null,
      onChildRunCompleted: async () => null,
    } as unknown as CallAgentLinkingService;
    const node = new CallAgentNode(new LoggerService(), module.get(AgentsPersistenceService), linkingStub);
    await node.setConfig({ response: 'sync' });
    node.setAgent(agent);
    const tool = node.getTool();
    const res = await tool.execute(
      { input: 'hi', threadAlias: 'x', summary: 'x summary' },
      { callerAgent: agent, threadId: 'caller-t', finishSignal: new Signal(), terminateSignal: new Signal() } as any,
    );
    expect(res).toBe('queued');
  });
});
