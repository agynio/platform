import { describe, it, expect } from 'vitest';
import { AgentNode } from '../src/nodes/agent/agent.node';
import { ConfigService } from '../src/services/config.service';
import { LoggerService } from '../src/services/logger.service';
import { LLM } from '@agyn/llm';
import { ResponseMessage, SystemMessage, ToolCallMessage, ToolCallOutputMessage } from '@agyn/llm';
import { FinishNode } from '../src/nodes/tools/finish/finish.node';

class StubLLM extends LLM {
  constructor(private mode: 'alwaysPlain' | 'toolAfterRestriction') {
    super({} as any);
  }

  async call(params: { model: string; input: Array<any>; tools?: Array<any> }) {
    // Decide based on last input: if we see a SystemMessage that matches restriction text, next response includes a tool call
    const last = params.input[params.input.length - 1];
    const hasRestriction = last instanceof SystemMessage || (last?.type === 'message' && last?.role === 'system');

    if (this.mode === 'toolAfterRestriction' && hasRestriction) {
      const tool: ToolCallMessage = new ToolCallMessage({
        type: 'function_call',
        call_id: 'finish-1',
        name: 'finish',
        arguments: JSON.stringify({ note: 'ok' }),
      } as any);
      return new ResponseMessage({ output: [tool.toPlain()] } as any);
    }

    // Otherwise return a plain assistant message with no tool calls
    const ai = { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'plain' }] } as any;
    return new ResponseMessage({ output: [ai] } as any);
  }
}

class StubFactory {
  constructor(private llm: LLM) {}
  createLLM() { return this.llm; }
}

function makeAgent(llm: LLM) {
  const cfg = new ConfigService({
    githubAppId: '1',
    githubAppPrivateKey: 'k',
    githubInstallationId: 'i',
    githubToken: 't',
    mongodbUrl: 'm',
  } as any);
  const logger = new LoggerService();
  const factory = new StubFactory(llm) as any;
  return new AgentNode(cfg, logger, factory, 'agent-1');
}

describe('Agent restrictOutput enforcement', () => {
  it('AC1: restrictOutput=false ends turn after call_model when no tool_calls', async () => {
    const agent = makeAgent(new StubLLM('alwaysPlain'));
    agent.setConfig({ restrictOutput: false });
    const res = await agent.invoke('t1', { content: 'hi', info: {} } as any);
    expect(res instanceof ResponseMessage).toBe(true);
  });

  it('AC2: restrictOutput=true with max=0 injects and loops until tool_call occurs', async () => {
    const agent = makeAgent(new StubLLM('toolAfterRestriction'));
    // Add finish tool so tool call can execute
    agent.addTool(new FinishNode(new LoggerService()));
    agent.setConfig({ restrictOutput: true, restrictionMaxInjections: 0 });
    const res = await agent.invoke('t2', { content: 'hello', info: {} } as any);
    expect(res instanceof ToolCallOutputMessage).toBe(true);
  });

  it('AC3: restrictOutput=true with max=2 injects at most 2 times then ends if no tool_calls', async () => {
    const agent = makeAgent(new StubLLM('alwaysPlain'));
    agent.setConfig({ restrictOutput: true, restrictionMaxInjections: 2 });
    const res = await agent.invoke('t3', { content: 'no tools', info: {} } as any);
    expect(res instanceof ResponseMessage).toBe(true);
  });

  it('AC4: counters reset after tools execute; subsequent turns start clean', async () => {
    const agent = makeAgent(new StubLLM('toolAfterRestriction'));
    agent.addTool(new FinishNode(new LoggerService()));
    agent.setConfig({ restrictOutput: true, restrictionMaxInjections: 1 });
    const res1 = await agent.invoke('t4', { content: 'turn1', info: {} } as any);
    expect(res1 instanceof ToolCallOutputMessage).toBe(true);
    const res2 = await agent.invoke('t4', { content: 'turn2', info: {} } as any);
    expect(res2 instanceof ToolCallOutputMessage).toBe(true);
  });
});
