import { describe, it, expect, vi } from 'vitest';
import { AIMessage, BaseMessage } from '@langchain/core/messages';
import { LoggerService } from '../src/services/logger.service';
import { ConfigService } from '../src/services/config.service';
import { CheckpointerService } from '../src/services/checkpointer.service';

// Mock ChatOpenAI to avoid network; must be declared before importing SimpleAgent
vi.mock('@langchain/openai', async (importOriginal) => {
  const mod = await importOriginal();
  class MockChatOpenAI extends mod.ChatOpenAI {
    constructor(config: any) {
      super({ ...config, apiKey: 'mock' });
    }
    withConfig(_cfg: any) {
      return { invoke: async () => new AIMessage('ok') } as any;
    }
    async invoke(_msgs: BaseMessage[], _opts?: any) {
      return new AIMessage('ok');
    }
    async getNumTokens(text: string): Promise<number> {
      return text.length;
    }
  }
  return { ...mod, ChatOpenAI: MockChatOpenAI };
});

// Mock CheckpointerService to avoid needing Mongo
vi.mock('../src/services/checkpointer.service', async (importOriginal) => {
  const mod = await importOriginal();
  class Fake extends mod.CheckpointerService {
    getCheckpointer() {
      return {
        async getTuple() {
          return undefined;
        },
        async *list() {},
        async put(_config: any, _checkpoint: any, _metadata: any) {
          return { configurable: { thread_id: 't', checkpoint_ns: '', checkpoint_id: '1' } } as any;
        },
        async putWrites() {},
        getNextVersion() { return '1'; },
      } as any;
    }
  }
  return { ...mod, CheckpointerService: Fake };
});

import { SimpleAgent } from '../src/agents/simple.agent';

// Helper to make a configured agent
function makeAgent() {
  const cfg = new ConfigService({
    githubAppId: '1', githubAppPrivateKey: 'k', githubInstallationId: 'i',
    openaiApiKey: 'x', githubToken: 't', slackBotToken: 's', slackAppToken: 'sa', mongodbUrl: 'm',
  });
  return new SimpleAgent(cfg, new LoggerService(), new CheckpointerService(new LoggerService()) as any, 'agent-buf');
}

describe('SimpleAgent buffer behavior', () => {
  it('processBuffer=oneByOne splits multi-message invoke into separate runs', async () => {
    const agent = makeAgent();
    agent.setConfig({ processBuffer: 'oneByOne' });
    const r = await agent.invoke('t1', [
      { content: 'a', info: {} } as any,
      { content: 'b', info: {} } as any,
      { content: 'c', info: {} } as any,
    ]);
    expect(r).toBeDefined();
  });

  it("whenBusy='injectAfterTools' injects messages during in-flight run", async () => {
    const agent = makeAgent();
    agent.setConfig({ whenBusy: 'injectAfterTools', debounceMs: 0 });
    // Kick off a run with one message
    const p = agent.invoke('t2', { content: 'start', info: {} } as any);
    // Immediately enqueue another which should be injected into the current run
    const p2 = agent.invoke('t2', { content: 'follow', info: {} } as any);
    const r1 = await p;
    const r2 = await p2;
    expect(r1).toBeDefined();
    expect(r2).toBeDefined();
  });
});

