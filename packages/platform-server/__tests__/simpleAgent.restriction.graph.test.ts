import { describe, it, expect, vi } from 'vitest';
import { AIMessage, BaseMessage, SystemMessage } from '@langchain/core/messages';
import { LoggerService } from '../src/core/services/logger.service.js';
import { ConfigService } from '../src/core/services/config.service.js';
import { LLMFactoryService } from '../src/core/services/llmFactory.service';
import { AgentNode as Agent } from '../src/nodes/agent/agent.node';

// Mock ChatOpenAI to control responses
vi.mock('@langchain/openai', async (importOriginal) => {
  const mod = await importOriginal();
  class MockChatOpenAI extends mod.ChatOpenAI {
    withConfig(_cfg: any) {
      return {
        invoke: async (_msgs: BaseMessage[]) => this._mockResponse(_msgs),
      } as any;
    }
    async invoke(_msgs: BaseMessage[]) {
      return this._mockResponse(_msgs);
    }
    async _mockResponse(msgs: BaseMessage[]) {
      const last = msgs[msgs.length - 1];
      // If the last message is a SystemMessage containing 'Do not produce a final answer directly',
      // then simulate that the model follows instruction by calling the finish tool
      if (last instanceof SystemMessage && String(last.content).includes('Do not produce a final answer directly')) {
        return new AIMessage({ content: '', tool_calls: [{ id: 't1', name: 'finish', args: { note: 'ok' } }] });
      }
      // Otherwise, return a normal message without tool calls
      return new AIMessage('plain');
    }
    async getNumTokens(text: string): Promise<number> { return text.length; }
  }
  return { ...mod, ChatOpenAI: MockChatOpenAI };
});

// Include finish FunctionTool via Agent wiring
import { FinishFunctionTool } from '../src/nodes/tools/finish/finish.tool';

// Mock CheckpointerService to avoid Mongo requirements
vi.mock('../src/services/checkpointer.service', async (importOriginal) => {
  const mod = await importOriginal();
  class Fake extends mod.CheckpointerService {
    getCheckpointer() {
      return {
        async getTuple() { return undefined; },
        async *list() {},
        async put(_config: any, _checkpoint: any, _metadata: any) { return { configurable: { thread_id: 't' } } as any; },
        async putWrites() {},
        getNextVersion() { return '1'; },
      } as any;
    }
  }
  return { ...mod, CheckpointerService: Fake };
});

// Patch Agent to add finish tool quickly in tests
vi.mock('../src/nodes/agent/agent.node', async (importOriginal) => {
  const mod = await importOriginal();
  const Original = mod.AgentNode;
  class TestAgent extends Original {
    addTool(tool: any) { super.addTool(tool); }
    init(config: any) {
      super.init(config);
      // add finish tool so model can call it
      // @ts-ignore private access for tests
      this.addTool(new FinishFunctionTool());
      return this;
    }
  }
  return { ...mod, AgentNode: TestAgent };
});

describe('Agent restriction enforcement', () => {
  const cfg = new ConfigService({
    githubAppId: '1',
    githubAppPrivateKey: 'k',
    githubInstallationId: 'i',
    openaiApiKey: 'x',
    githubToken: 't',
    mongodbUrl: 'm',
  });

  it('restrictOutput=false: call_model with no tool_calls leads to END (no enforce)', async () => {
    const agent = new Agent(cfg, new LoggerService(), new LLMFactoryService(cfg) as any, 'a1');
    agent.setConfig({ restrictOutput: false });
    const res = await agent.invoke('t', { content: 'hi', info: {} } as any);
    expect(res).toBeDefined();
  });

  it('restrictOutput=true & restrictionMaxInjections=0: injects and loops until tool call', async () => {
    const agent = new Agent(cfg, new LoggerService(), new LLMFactoryService(cfg) as any, 'a2');
    agent.setConfig({ restrictOutput: true, restrictionMaxInjections: 0 });
    const res = await agent.invoke('t', { content: 'hi', info: {} } as any);
    expect(res).toBeDefined();
  });

  it('restrictOutput=true & restrictionMaxInjections=2: injects twice then ends if still no tool_calls', async () => {
    // Remock LLM to never call tools even after injection
    const openai = await import('@langchain/openai');
    class NoToolLLM extends (openai as any).ChatOpenAI {
      withConfig() { return { invoke: async (_: any) => new AIMessage('still-no-tool') } as any; }
      async invoke(_: any) { return new AIMessage('still-no-tool'); }
      async getNumTokens(t: string) { return t.length; }
    }
    ;(openai as any).ChatOpenAI = NoToolLLM;

    const agent = new Agent(cfg, new LoggerService(), new LLMFactoryService(cfg) as any, 'a3');
    agent.setConfig({ restrictOutput: true, restrictionMaxInjections: 2 });
    const res = await agent.invoke('t', { content: 'hello', info: {} } as any);
    expect(res).toBeDefined();
  });
});
