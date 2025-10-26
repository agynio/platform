import { describe, it, expect, vi } from 'vitest';
import { AIMessage } from '@langchain/core/messages';
import { LoggerService } from '../src/core/services/logger.service.js';
import { ConfigService } from '../src/core/services/config.service.js';
// Replace LLMFactoryService usage with provisioner stub per Issue #451

// Mock ChatOpenAI to capture the model used at invoke time
// No CheckpointerService or LLMFactoryService; use provisioner stub

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
    const provisioner = { getLLM: async () => ({ call: async ({ model }: any) => ({ text: `model:${model}`, output: [] }) }) };
    const agent = new Agent(new LoggerService(), provisioner as any);
    agent.init({ nodeId: 'agent-1' });
    // Initial default should be gpt-5
    const anyA: any = agent as any;
    expect(anyA.llm.model).toBe('gpt-5');

    agent.setConfig({ model: 'override-model' });

    const res = await agent.invoke('thread-1', { content: 'hello', info: {} } as any);
    expect(res?.content).toBe(`model:override-model`);
  });
});
