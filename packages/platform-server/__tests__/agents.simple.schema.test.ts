import { describe, it, expect, vi } from 'vitest';
import { Agent, BaseAgent } from '../src/nodes/agent/agent.node';

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
    // Unknown keys should be rejected by strict parsing; legacy aliases are not supported.
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

    a.setConfig({ summarizationKeepTokens: 5, summarizationMaxTokens: 100 });
    expect(anyA.summarizeNode.setOptions).toHaveBeenCalledWith({ keepTokens: 5, maxTokens: 100 });
  });

  it('supports model override via setConfig', () => {
    const a = makeAgent();
    const anyA: any = a as any;
    const originalLLM = anyA.llm;
    a.setConfig({ model: 'override-model' });
    // Expect underlying llm object replaced and nodes rebound to the new instance
    expect(anyA.llm).not.toBe(originalLLM);
    expect((anyA.llm as any).model).toBe('override-model');
    expect(anyA.callModelNode.llm).toBe(anyA.llm);
    expect(anyA.summarizeNode.llm).toBe(anyA.llm);
    expect(anyA.loggerService.info).toHaveBeenCalledWith('Agent model updated to override-model');
  });

  it('rejects legacy summarizationKeepLast key via setConfig', () => {
    const a = makeAgent();
    // Providing an unknown key should cause strict schema parse to throw
    expect(() => a.setConfig({ summarizationKeepLast: 1 } as any)).toThrowError();
  });
});
