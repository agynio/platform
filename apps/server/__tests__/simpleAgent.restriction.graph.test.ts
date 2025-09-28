import { describe, it, expect, vi } from 'vitest';
import { AIMessage, BaseMessage, SystemMessage } from '@langchain/core/messages';
import { LoggerService } from '../src/services/logger.service';
import { ConfigService } from '../src/services/config.service';
import { CheckpointerService } from '../src/services/checkpointer.service';
import { Agent as SimpleAgent } from '../src/agents/agent';

vi.mock('@langchain/openai', async (importOriginal) => {
  const mod = await importOriginal();
  class MockChatOpenAI extends mod.ChatOpenAI {
    withConfig(_cfg: any) {
      return { invoke: async (_msgs: BaseMessage[]) => this._mockResponse(_msgs) } as any;
    }
    async invoke(_msgs: BaseMessage[]) { return this._mockResponse(_msgs); }
    async _mockResponse(msgs: BaseMessage[]) {
      const last = msgs[msgs.length - 1];
      if (last instanceof SystemMessage && String(last.content).includes('Do not produce a final answer directly')) {
        return new AIMessage({ content: '', tool_calls: [{ id: 't1', name: 'finish', args: { note: 'ok' } }] });
      }
      return new AIMessage('plain');
    }
    async getNumTokens(text: string): Promise<number> { return text.length; }
  }
  return { ...mod, ChatOpenAI: MockChatOpenAI };
});

import { FinishTool } from '../src/tools/finish.tool';

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
vi.mock('../src/agents/agent', async (importOriginal) => {
  const mod = await importOriginal();
  const Original = mod.Agent;
  class TestAgent extends Original {
    addTool(tool: any) { super.addTool(tool); }
    init(config: any) {
      super.init(config);
      // @ts-ignore
      this.addTool(new FinishTool());
      return this;
    }
  }
  return { ...mod, Agent: TestAgent };
});

describe('Agent restriction enforcement', () => {
  const cfg = new ConfigService({
    githubAppId: '1', githubAppPrivateKey: 'k', githubInstallationId: 'i', openaiApiKey: 'x', githubToken: 't', slackBotToken: 's', slackAppToken: 'sa', mongodbUrl: 'm',
  });

  it('restrictOutput=false: call_model with no tool_calls leads to END (no enforce)', async () => {
    const agent = new SimpleAgent(cfg, new LoggerService(), new CheckpointerService(new LoggerService()) as any, 'a1');
    agent.setConfig({ restrictOutput: false });
    const res = await agent.invoke('t', { content: 'hi', info: {} } as any);
    expect(res).toBeDefined();
  });

  it('restrictOutput=true & restrictionMaxInjections=0: injects and loops until tool call', async () => {
    const agent = new SimpleAgent(cfg, new LoggerService(), new CheckpointerService(new LoggerService()) as any, 'a2');
    agent.setConfig({ restrictOutput: true, restrictionMaxInjections: 0 });
    const res = await agent.invoke('t', { content: 'hi', info: {} } as any);
    expect(res).toBeDefined();
  });

  it('restrictOutput=true & restrictionMaxInjections=2: injects twice then ends if still no tool_calls', async () => {
    const openai = await import('@langchain/openai');
    class NoToolLLM extends (openai as any).ChatOpenAI {
      withConfig() { return { invoke: async (_: any) => new AIMessage('still-no-tool') } as any; }
      async invoke(_: any) { return new AIMessage('still-no-tool'); }
      async getNumTokens(t: string) { return t.length; }
    }
    ;(openai as any).ChatOpenAI = NoToolLLM;

    const agent = new SimpleAgent(cfg, new LoggerService(), new CheckpointerService(new LoggerService()) as any, 'a3');
    agent.setConfig({ restrictOutput: true, restrictionMaxInjections: 2 });
    const res = await agent.invoke('t', { content: 'hello', info: {} } as any);
    expect(res).toBeDefined();
  });
});
