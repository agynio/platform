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
import type { TriggerMessage } from '../src/triggers/base.trigger';

// Helper to make a configured agent
function makeAgent() {
  const cfg = new ConfigService({
    githubAppId: '1', githubAppPrivateKey: 'k', githubInstallationId: 'i',
    openaiApiKey: 'x', githubToken: 't', mongodbUrl: 'm',
  });
  return new SimpleAgent(cfg, new LoggerService(), new CheckpointerService(new LoggerService()) as any, 'agent-buf');
}

describe('SimpleAgent buffer behavior', () => {
  it('debounce delays run start and batches within window', async () => {
    vi.useFakeTimers();
    const cfg = new ConfigService({
      githubAppId: '1', githubAppPrivateKey: 'k', githubInstallationId: 'i',
      openaiApiKey: 'x', githubToken: 't', mongodbUrl: 'm',
    });
    const logger = { info: vi.fn(), debug: vi.fn(), error: vi.fn() } as unknown as LoggerService;
    const agent = new SimpleAgent(cfg, logger as any, new CheckpointerService(new LoggerService()) as any, 'agent-deb');
    agent.setConfig({ debounceMs: 50, processBuffer: 'allTogether' });

    const p1 = agent.invoke('td', { content: 'a', info: {} });
    // Enqueue another within debounce window; should batch into the same run
    const p2 = agent.invoke('td', { content: 'b', info: {} });

    // Before debounce elapses, no run should have started
    await vi.advanceTimersByTimeAsync(40);
    const startsEarly = (logger.info as any).mock.calls.filter((c: any[]) => String(c[0]).startsWith('Starting run'));
    expect(startsEarly.length).toBe(0);

    // After window, exactly one run should start
    await vi.advanceTimersByTimeAsync(20);
    const starts = (logger.info as any).mock.calls.filter((c: any[]) => String(c[0]).startsWith('Starting run'));
    expect(starts.length).toBe(1);
    await Promise.all([p1, p2]);
  });

  it('processBuffer=oneByOne splits multi-message invoke into separate runs', async () => {
    const cfg = new ConfigService({
      githubAppId: '1', githubAppPrivateKey: 'k', githubInstallationId: 'i',
      openaiApiKey: 'x', githubToken: 't', mongodbUrl: 'm',
    });
    const logger = { info: vi.fn(), debug: vi.fn(), error: vi.fn() } as unknown as LoggerService;
    const agent = new SimpleAgent(cfg, logger as any, new CheckpointerService(new LoggerService()) as any, 'agent-one');
    agent.setConfig({ processBuffer: 'oneByOne' });
    const msgs: TriggerMessage[] = [
      { content: 'a', info: {} },
      { content: 'b', info: {} },
      { content: 'c', info: {} },
    ];
    const r = await agent.invoke('t1', msgs);
    expect(r).toBeDefined();
    const starts = (logger.info as any).mock.calls.filter((c: any[]) => String(c[0]).startsWith('Starting run'));
    expect(starts.length).toBe(3);
  });

  it("processBuffer='allTogether' batches multi-message invoke into a single run (no debounce)", async () => {
    const cfg = new ConfigService({
      githubAppId: '1', githubAppPrivateKey: 'k', githubInstallationId: 'i',
      openaiApiKey: 'x', githubToken: 't', slackBotToken: 's', slackAppToken: 'sa', mongodbUrl: 'm',
    });
    const logger = { info: vi.fn(), debug: vi.fn(), error: vi.fn() } as unknown as LoggerService;
    const agent = new SimpleAgent(cfg, logger as any, new CheckpointerService(new LoggerService()), 'agent-all');
    agent.setConfig({ processBuffer: 'allTogether', debounceMs: 0 });
    const msgs: TriggerMessage[] = [
      { content: 'a', info: {} },
      { content: 'b', info: {} },
      { content: 'c', info: {} },
    ];
    const r = await agent.invoke('tA', msgs);
    expect(r).toBeDefined();
    const starts = (logger.info as any).mock.calls.filter((c: any[]) => String(c[0]).startsWith('Starting run'));
    expect(starts.length).toBe(1);
  });

  it("whenBusy='injectAfterTools' injects messages during in-flight run", async () => {
    const agent = makeAgent();
    agent.setConfig({ whenBusy: 'injectAfterTools', debounceMs: 0 });
    // Kick off a run with one message
    const p = agent.invoke('t2', { content: 'start', info: {} });
    // Immediately enqueue another which should be injected into the current run
    const p2 = agent.invoke('t2', { content: 'follow', info: {} });
    const r1 = await p;
    const r2 = await p2;
    expect(r1).toBeDefined();
    expect(r2).toBeDefined();
  });
});
