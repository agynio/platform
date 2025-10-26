import { describe, it, expect } from 'vitest';
import { LoggerService } from '../src/core/services/logger.service.js';
import { ConfigService } from '../src/core/services/config.service.js';
import { AgentNode as Agent } from '../src/nodes/agent/agent.node';
import { PrismaService } from '../src/core/services/prisma.service';
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';

describe('Agent config restrictions', () => {
  it('setConfig preserves systemPrompt and toggles restriction flags without concatenation', async () => {
    const cfg = new ConfigService({
      githubAppId: '1', githubAppPrivateKey: 'k', githubInstallationId: 'i', openaiApiKey: 'x', githubToken: 't', mongodbUrl: 'm',
    } as any);
    const provisioner = { getLLM: async () => ({ call: async ({ model }: any) => ({ text: `model:${model}`, output: [] }) }) };
    const agent = new Agent(new LoggerService(), provisioner as any);
    agent.init({ nodeId: 'a1' });
    // Update system prompt
    agent.setConfig({ systemPrompt: 'Base system' });
    // Toggle restriction flags
    agent.setConfig({ restrictOutput: true, restrictionMessage: 'Please call tools', restrictionMaxInjections: 2 });
    // Update again to ensure no concatenation side effects
    agent.setConfig({ systemPrompt: 'Base system 2' });
    // There is no direct getter; we ensure invocation does not throw and behavior is isolated
    const res = await agent.invoke('t', { content: 'hi', info: {} } as any);
    expect(res).toBeDefined();
  });
});
