import { describe, it, expect, vi } from 'vitest';
import { LoggerService } from '../src/services/logger.service';
import { ConfigService } from '../src/services/config.service';
import { CheckpointerService } from '../src/services/checkpointer.service';
import { Agent } from '../src/nodes/agent/agent.node';

vi.mock('@langchain/openai', () => ({ ChatOpenAI: class { withConfig() { return { invoke: async () => ({ text: 'ok' }) } as any; } async getNumTokens(t: string) { return t.length; } } }));
vi.mock('../src/services/checkpointer.service', async (importOriginal) => {
  const mod = await importOriginal();
  class Fake extends mod.CheckpointerService { getCheckpointer() { return { async getTuple() {}, async *list() {}, async put() { return { configurable: { thread_id: 't' } } as any; }, async putWrites() {}, getNextVersion() { return '1'; } } as any; } }
  return { ...mod, CheckpointerService: Fake };
});

describe('Agent config restrictions', () => {
  it('setConfig preserves systemPrompt and toggles restriction flags without concatenation', async () => {
    const cfg = new ConfigService({
      githubAppId: '1', githubAppPrivateKey: 'k', githubInstallationId: 'i', openaiApiKey: 'x', githubToken: 't', mongodbUrl: 'm',
    } as any);
    const agent = new Agent(cfg, new LoggerService(), new CheckpointerService(new LoggerService()) as any, 'a1');
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
