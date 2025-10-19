import { describe, it, expect, vi } from 'vitest';
import { Agent } from '../src/nodes/agent/agent.node';
import { BaseAgent } from '../src/agents/base.agent';

class MockConfigService { openaiApiKey = 'sk-abc'; }
class MockLoggerService { info = vi.fn(); debug = vi.fn(); error = vi.fn(); }
class MockCheckpointerService { getCheckpointer = vi.fn(() => ({} as any)); }

// Minimal stub: Agent requires an agentId to init
const makeAgent = () => new Agent(new MockConfigService() as any, new MockLoggerService() as any, new MockCheckpointerService() as any, 'agent-1');

describe('BaseAgent.getConfigSchema / Agent.setConfig', () => {
  it('returns expected JSON schema', () => {
    const a = makeAgent();
    const schema = (a as unknown as BaseAgent).getConfigSchema() as any;
    expect(schema.type).toBe('object');
    expect(schema.properties.systemPrompt).toMatchObject({ type: 'string' });
  // Legacy key summarizationKeepLast intentionally not present in schema anymore; we accept it leniently at runtime.
    expect(schema.properties.summarizationMaxTokens).toMatchObject({ type: 'integer', minimum: 1 });
  });

  it('setConfig applies systemPrompt and summarization fields', () => {
    const a = makeAgent();
    // Spy on internal nodes via any access (we just validate calls not strict behavior)
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
  const originalLLM = (anyA.llm);
  a.setConfig({ model: 'override-model' });
  // Expect underlying llm object mutated, not replaced with a new node
  expect(anyA.llm).toBe(originalLLM);
  expect((anyA.llm as any).model).toBe('override-model');
  expect(anyA.loggerService.info).toHaveBeenCalledWith('Agent model updated to override-model');
  });
});
