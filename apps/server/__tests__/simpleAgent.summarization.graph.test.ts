import { describe, it, expect, vi } from 'vitest';
import { AIMessage, BaseMessage } from '@langchain/core/messages';
import { LoggerService } from '../src/services/logger.service';
import { ConfigService } from '../src/services/config.service';
import { CheckpointerService } from '../src/services/checkpointer.service';

vi.mock('@langchain/openai', async (importOriginal) => {
  const mod = await importOriginal();
  class MockChatOpenAI extends mod.ChatOpenAI {
    constructor(config: any) { super({ ...config, apiKey: 'mock' }); }
    withConfig(_cfg: any) { return { invoke: async () => new AIMessage('ok') } as any; }
    async invoke(_msgs: BaseMessage[], _opts?: any) { return new AIMessage('ok'); }
    async getNumTokens(text: string): Promise<number> { return text.length; }
  }
  return { ...mod, ChatOpenAI: MockChatOpenAI };
});

vi.mock('../src/services/checkpointer.service', async (importOriginal) => {
  const mod = await importOriginal();
  class Fake extends mod.CheckpointerService {
    getCheckpointer() {
      return {
        async getTuple() { return undefined; },
        async *list() {},
        async put(_config: any, _checkpoint: any, _metadata: any) { return { configurable: { thread_id: 't', checkpoint_ns: '', checkpoint_id: '1' } } as any; },
        async putWrites() {},
        getNextVersion() { return '1'; },
      } as any;
    }
  }
  return { ...mod, CheckpointerService: Fake };
});

import { Agent as SimpleAgent } from '../src/agents/agent';

describe('Agent summarization graph', () => {
  it('invokes successfully over several turns with summarization configured', async () => {
    const cfg = new ConfigService({
      githubAppId: '1', githubAppPrivateKey: 'k', githubInstallationId: 'i', openaiApiKey: 'x', githubToken: 't', slackBotToken: 's', slackAppToken: 'sa', mongodbUrl: 'm',
    });
    const agent = new SimpleAgent(cfg, new LoggerService(), new CheckpointerService(new LoggerService()) as any, 'agent-1');
    agent.setConfig({ summarizationKeepLast: 2, summarizationMaxTokens: 200 });

    const r1 = await agent.invoke('t', { content: 'hi', info: {} } as any);
    const r2 = await agent.invoke('t', { content: 'there', info: {} } as any);
    const r3 = await agent.invoke('t', { content: 'friend', info: {} } as any);

    expect(r1).toBeDefined();
    expect(r2).toBeDefined();
    expect(r3).toBeDefined();
  });
});
