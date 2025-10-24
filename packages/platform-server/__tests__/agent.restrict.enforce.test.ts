import { describe, it, expect, vi } from 'vitest';
import { AgentNode } from '../src/nodes/agent/agent.node';
import { ConfigService } from '../src/core/services/config.service';
import { LoggerService } from '../src/core/services/logger.service';
import { LLM } from '@agyn/llm';
import { ResponseMessage, SystemMessage, ToolCallMessage, ToolCallOutputMessage } from '@agyn/llm';
import { FinishNode } from '../src/nodes/tools/finish/finish.node';
import OpenAI from 'openai';
import type { Response as OpenAIResponse, ResponseFunctionToolCall } from 'openai/resources/responses/responses.mjs';

class StubLLM extends LLM {
  constructor(private mode: 'alwaysPlain' | 'toolAfterRestriction') {
    // Provide a harmless OpenAI client; we override call, so no network is used
    super(new OpenAI({ apiKey: 'test', baseURL: 'http://localhost' }));
  }

  async call(params: { model: string; input: Array<any>; tools?: Array<any> }) {
    // Decide based on last input: if we see a SystemMessage that matches restriction text, next response includes a tool call
    const last = params.input[params.input.length - 1];
    const hasRestriction = last instanceof SystemMessage || (last?.type === 'message' && last?.role === 'system');

    if (this.mode === 'toolAfterRestriction' && hasRestriction) {
      const tc: ResponseFunctionToolCall = {
        type: 'function_call',
        call_id: 'finish-1',
        name: 'finish',
        arguments: JSON.stringify({ note: 'ok' }),
      } as ResponseFunctionToolCall;
      const tool: ToolCallMessage = new ToolCallMessage(tc);
      const resp = { output: [tool.toPlain()] } as unknown as OpenAIResponse;
      return new ResponseMessage(resp);
    }

    // Otherwise return a plain assistant message with no tool calls
    const ai = { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'plain' }] };
    const resp = { output: [ai] } as unknown as OpenAIResponse;
    return new ResponseMessage(resp);
  }
}

class TestLLMFactoryService extends (await import('../src/services/llmFactory.service')).LLMFactoryService {
  constructor(private testLLM: LLM, cfg: ConfigService) { super(cfg); }
  createLLM() { return this.testLLM; }
}

class TestLogger extends LoggerService {
  infos: Array<{ message: string; args: any[] }> = [];
  errors: Array<{ message: string; args: any[] }> = [];
  debugLogs: Array<{ message: string; args: any[] }> = [];
  info(message: string, ...optionalParams: any[]): void {
    this.infos.push({ message, args: optionalParams });
    super.info(message, ...optionalParams);
  }
  error(message: string, ...optionalParams: any[]): void {
    this.errors.push({ message, args: optionalParams });
    super.error(message, ...optionalParams);
  }
  debug(message: string, ...optionalParams: any[]): void {
    this.debugLogs.push({ message, args: optionalParams });
    super.debug(message, ...optionalParams);
  }
}

function makeAgent(llm: LLM, logger?: LoggerService) {
  const cfg = new ConfigService({
    githubAppId: '1',
    githubAppPrivateKey: 'k',
    githubInstallationId: 'i',
    githubToken: 't',
    mongodbUrl: 'mongodb://localhost:27017/test',
    // optional config fallbacks handled by service
  } as any);
  const testLogger = logger ?? new TestLogger();
  const factory = new TestLLMFactoryService(llm, cfg);
  const agent = new AgentNode(cfg, testLogger, factory);
  agent.init({ nodeId: 'agent-1' });
  return agent;
}

describe('Agent restrictOutput enforcement', () => {
  it('AC1: restrictOutput=false ends turn after call_model when no tool_calls', async () => {
    const agent = makeAgent(new StubLLM('alwaysPlain'));
    agent.setConfig({ restrictOutput: false });
    const res = await agent.invoke('t1', { content: 'hi', info: {} });
    expect(res instanceof ResponseMessage).toBe(true);
  });

  it('AC2: restrictOutput=true with max=0 injects and loops until tool_call occurs', async () => {
    const agent = makeAgent(new StubLLM('toolAfterRestriction'));
    // Add finish tool so tool call can execute
    agent.addTool(new FinishNode(new LoggerService()));
    agent.setConfig({ restrictOutput: true, restrictionMaxInjections: 0 });
    const res = await agent.invoke('t2', { content: 'hello', info: {} });
    expect(res instanceof ToolCallOutputMessage).toBe(true);
  });

  it('AC3: restrictOutput=true with max=2 injects at most 2 times then ends if no tool_calls', async () => {
    const agent = makeAgent(new StubLLM('alwaysPlain'));
    agent.setConfig({ restrictOutput: true, restrictionMaxInjections: 2 });
    const res = await agent.invoke('t3', { content: 'no tools', info: {} });
    expect(res instanceof ResponseMessage).toBe(true);
  });

  it('AC4: counters reset after tools execute; subsequent turns start clean', async () => {
    const tlogger = new TestLogger();
    const agent = makeAgent(new StubLLM('toolAfterRestriction'), tlogger);
    agent.addTool(new FinishNode(tlogger));
    agent.setConfig({ restrictOutput: true, restrictionMaxInjections: 1 });
    const res1 = await agent.invoke('t4', { content: 'turn1', info: {} });
    expect(res1 instanceof ToolCallOutputMessage).toBe(true);
    const res2 = await agent.invoke('t4', { content: 'turn2', info: {} });
    expect(res2 instanceof ToolCallOutputMessage).toBe(true);
    // Assert logs recorded for enforcement at least once
    const enforcementLogs = tlogger.infos.filter((l) => l.message.includes('Enforcing restrictOutput'));
    expect(enforcementLogs.length).toBeGreaterThan(0);
  });

  it('AC6: logs emitted on enforcement and cap reached; default message used when blank restriction', async () => {
    const tlogger = new TestLogger();
    const agent = makeAgent(new StubLLM('alwaysPlain'), tlogger);
    agent.setConfig({ restrictOutput: true, restrictionMaxInjections: 2, restrictionMessage: '   ' });
    await agent.invoke('t5', { content: 'try', info: {} });
    const blankMsgLogs = tlogger.infos.filter((l) => l.message.includes('Restriction message blank; using default'));
    expect(blankMsgLogs.length).toBeGreaterThan(0);
    const capLogs = tlogger.infos.filter((l) => l.message.includes('Restriction cap reached'));
    expect(capLogs.length).toBeGreaterThan(0);
  });
});
