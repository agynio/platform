
import { describe, it, expect } from 'vitest';
import { Test } from '@nestjs/testing';
import { LoggerService } from '../src/core/services/logger.service';
import { ConfigService } from '../src/core/services/config.service';
import { AgentNode } from '../src/graph/nodes/agent/agent.node';
import { ResponseMessage, AIMessage } from '@agyn/llm';
import { CallAgentNode } from '../src/graph/nodes/tools/call_agent/call_agent.node';
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';

class BusyAgent extends AgentNode {
  override async invoke(): Promise<ResponseMessage> {
    return new ResponseMessage({ output: [AIMessage.fromText('queued').toPlain()] });
  }
}

describe('call_agent sync busy', () => {
  it('returns queued when target thread running (sync)', async () => {
    const module = await Test.createTestingModule({
      providers: [LoggerService, ConfigService, BusyAgent, { provide: LLMProvisioner, useValue: {} }],
    }).compile();
    const agent = await module.resolve(BusyAgent);
    await agent.setConfig({});
    agent.init({ nodeId: 'caller' });
    const node = new CallAgentNode(new LoggerService());
    await node.setConfig({ response: 'sync' });
    node.setAgent(agent);
    const tool = node.getTool();
    const res = await tool.execute({ input: 'hi', childThreadId: 'x' }, { callerAgent: agent, threadId: 'caller-t' });
    expect(res).toBe('queued');
  });
});
