
import { describe, it, expect } from 'vitest';
import { Test } from '@nestjs/testing';
import { LoggerService } from '../src/core/services/logger.service';
import { ConfigService } from '../src/core/services/config.service';
import { AgentNode } from '../src/graph/nodes/agent/agent.node';
import { AIMessage, HumanMessage, ResponseMessage } from '@agyn/llm';
import { CallAgentFunctionTool } from '../src/graph/nodes/tools/call_agent/call_agent.tool';
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';
import { Signal } from '../src/signal';
import type { LLMContext } from '../src/llm/types';

class BusyAgent extends AgentNode {
  override async invoke(_threadId: string, _messages: HumanMessage[]): Promise<ResponseMessage> {
    return new ResponseMessage({ output: [AIMessage.fromText('queued').toPlain()] });
  }
}

describe('call_agent sync busy', () => {
  it('returns queued when target thread running (sync)', async () => {
    const module = await Test.createTestingModule({
      providers: [LoggerService, ConfigService, BusyAgent, { provide: LLMProvisioner, useValue: { getLLM: async () => ({ call: async () => ({ text: 'ok', output: [] }) }) } }],
    }).compile();
    const agent = await module.resolve(BusyAgent);
    await agent.setConfig({});
    agent.init({ nodeId: 'caller' });
    // Construct CallAgentFunctionTool directly with a simple node wrapper
    const node = { config: { response: 'sync' as const }, agent } as unknown as import('../src/graph/nodes/tools/call_agent/call_agent.node').CallAgentNode;
    const tool = new CallAgentFunctionTool(new LoggerService(), node);
    const ctx: LLMContext = { callerAgent: agent, threadId: 'caller-t', finishSignal: new Signal() };
    const res = await tool.execute({ input: 'hi', childThreadId: 'x' }, ctx);
    expect(res).toBe('queued');
  });
});
