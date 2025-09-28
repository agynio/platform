import { describe, it, expect, vi } from 'vitest';
import { Agent as SimpleAgent } from '../src/agents/agent';

class MockConfigService { openaiApiKey = 'sk-abc'; }
class MockLoggerService { info = vi.fn(); debug = vi.fn(); error = vi.fn(); }
class MockCheckpointerService { getCheckpointer = vi.fn(() => ({} as any)); }

// Minimal stub: Agent requires an agentId to init
const makeAgent = () => new SimpleAgent(new MockConfigService() as any, new MockLoggerService() as any, new MockCheckpointerService() as any, 'agent-1');

describe('Agent.setConfig', () => {
  it('setConfig applies systemPrompt and summarization fields', () => {
    const a = makeAgent();
    const anyA: any = a as any;
    anyA.callModelNode = { setSystemPrompt: vi.fn(), addTool: vi.fn(), removeTool: vi.fn() };
    anyA.summarizeNode = { setOptions: vi.fn() };

    a.setConfig({ systemPrompt: 'You are helpful.' });
    expect(anyA.callModelNode.setSystemPrompt).toHaveBeenCalledWith('You are helpful.');

    a.setConfig({ summarizationKeepLast: 5, summarizationMaxTokens: 100 });
    expect(anyA.summarizeNode.setOptions).toHaveBeenCalledWith({ keepTokens: 5, maxTokens: 100 });
  });

  it('supports model override via setConfig', () => {
    const a = makeAgent();
    const anyA: any = a as any;
    const originalLLM = anyA.llm;
    a.setConfig({ model: 'override-model' });
    expect(anyA.llm).toBe(originalLLM);
    expect((anyA.llm as any).model).toBe('override-model');
    expect(anyA.loggerService.info).toHaveBeenCalledWith('Agent model updated to override-model');
  });
});
