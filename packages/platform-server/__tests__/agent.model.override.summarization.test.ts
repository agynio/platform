import { describe, it, expect, vi } from 'vitest';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { LoggerService } from '../src/services/logger.service';
import { ConfigService } from '../src/services/config.service';
import { CheckpointerService } from '../src/services/checkpointer.service';

// Mock ChatOpenAI to capture the model used during summarization
vi.mock('@langchain/openai', async (importOriginal) => {
  const mod = await importOriginal();
  class MockChatOpenAI extends mod.ChatOpenAI {
    public model: string;
    constructor(config: any) {
      super(config);
      this.model = config?.model || 'unknown';
    }
    withConfig(_cfg: any) {
      const self = this;
      return { invoke: async () => new AIMessage(`model:${self.model}`) } as any;
    }
    async invoke(_msgs: any[]) {
      return new AIMessage(`model:${this.model}`);
    }
    async getNumTokens(text: string): Promise<number> {
      return text.length;
    }
  }
  return { ...mod, ChatOpenAI: MockChatOpenAI };
});

// Mock CheckpointerService to avoid Mongo dependency
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
        getNextVersion() {
          return '1';
        },
      } as any;
    }
  }
  return { ...mod, CheckpointerService: Fake };
});

import { Agent } from '../src/nodes/agent/agent.node';

describe('Agent summarization uses overridden model', () => {
  it('summarization path honors setConfig({ model })', async () => {
    const cfg = new ConfigService({
      githubAppId: '1',
      githubAppPrivateKey: 'k',
      githubInstallationId: 'i',
      openaiApiKey: 'x',
      githubToken: 't',
      mongodbUrl: 'm',
    });
    const agent = new Agent(cfg, new LoggerService(), new CheckpointerService(new LoggerService()) as any, 'agent-1');
    // Default llm model should be gpt-5
    const anyA: any = agent as any;
    expect(anyA.llm.model).toBe('gpt-5');

    // Configure summarization to trigger for small budgets and override the model
    agent.setConfig({ summarizationKeepTokens: 1, summarizationMaxTokens: 3 });
    agent.setConfig({ model: 'override-model' });

    // Create a chat state that exceeds the maxTokens threshold to force summarization
    const state = { messages: [new HumanMessage('AAAA'), new HumanMessage('BBBB')], summary: '' };

    // Call summarization node directly to inspect summary content
    const out = await (anyA.summarizeNode as any).action(state);
    expect(out.summary).toBe('model:override-model');
  });
});

