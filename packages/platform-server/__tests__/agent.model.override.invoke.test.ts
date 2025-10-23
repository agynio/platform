import { describe, it, expect, vi } from 'vitest';
import { AIMessage } from '@langchain/core/messages';
import { LoggerService } from '../src/core/services/logger.service.js';
import { ConfigService } from '../src/core/services/config.service.js';
import { LLMFactoryService } from '../src/core/services/llmFactory.service';

// Mock ChatOpenAI to capture the model used at invoke time
// Spy LLMFactoryService to return a stub LLM that reports model name in output
vi.spyOn(LLMFactoryService.prototype, 'createLLM').mockReturnValue({
  call: async ({ model }: any) => ({ text: `model:${model}`, output: [] }),
} as any);

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

import { AgentNode as Agent } from '../src/nodes/agent/agent.node';

describe('Agent model override at runtime', () => {
  it('uses override model at invoke after setConfig', async () => {
    const cfg = new ConfigService({
      githubAppId: '1',
      githubAppPrivateKey: 'k',
      githubInstallationId: 'i',
      openaiApiKey: 'x',
      githubToken: 't',
      mongodbUrl: 'm',
    });
    const agent = new Agent(cfg, new LoggerService(), new LLMFactoryService(cfg) as any, 'agent-1');
    // Initial default should be gpt-5
    const anyA: any = agent as any;
    expect(anyA.llm.model).toBe('gpt-5');

    agent.setConfig({ model: 'override-model' });

    const res = await agent.invoke('thread-1', { content: 'hello', info: {} } as any);
    expect(res?.content).toBe(`model:override-model`);
  });
});
