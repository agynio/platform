import { describe, it, expect, vi } from 'vitest';
import { SimpleAgent, SimpleAgentStaticConfigSchema } from '../src/agents/simple.agent';

class MockConfigService { openaiApiKey = 'sk-abc'; }
class MockLoggerService { info = vi.fn(); debug = vi.fn(); error = vi.fn(); }
class MockCheckpointerService { getCheckpointer = vi.fn(() => ({} as any)); }

// Minimal stub: SimpleAgent requires an agentId to init
const makeAgent = () => new SimpleAgent(new MockConfigService() as any, new MockLoggerService() as any, new MockCheckpointerService() as any, 'agent-1');

describe('SimpleAgent buffer handling config schema', () => {
  it('exposes debounceMs/whenBusy/processBuffer with defaults', () => {
    const parsed = SimpleAgentStaticConfigSchema.parse({});
    expect(parsed.debounceMs).toBe(0);
    expect(parsed.whenBusy).toBe('wait');
    expect(parsed.processBuffer).toBe('allTogether');
  });

  it('validates enum values', () => {
    const parsed = SimpleAgentStaticConfigSchema.parse({ whenBusy: 'injectAfterTools', processBuffer: 'oneByOne' });
    expect(parsed.whenBusy).toBe('injectAfterTools');
    expect(parsed.processBuffer).toBe('oneByOne');
  });

  it('setConfig continues to apply runtime scheduling config', () => {
    const a = makeAgent();
    const anyA: any = a as any;
    // Spy on applyRuntimeConfig to ensure it is invoked
    const spy = vi.spyOn(anyA, 'applyRuntimeConfig');
    a.setConfig({ debounceMs: 123, whenBusy: 'wait', processBuffer: 'allTogether' });
    expect(spy).toHaveBeenCalled();
    // Optional legacy mapping is commented (no-op), so just ensure no throw
  });

  it('rejects invalid enum values in schema and setConfig', () => {
    const res = SimpleAgentStaticConfigSchema.safeParse({ whenBusy: 'bogus' });
    expect(res.success).toBe(false);
    const a = makeAgent();
    expect(() => a.setConfig({ whenBusy: 'bogus' })).toThrowError();
  });

  it('rejects negative summarizationKeepTokens/maxTokens', () => {
    const res1 = SimpleAgentStaticConfigSchema.safeParse({ summarizationKeepTokens: -1 });
    const res2 = SimpleAgentStaticConfigSchema.safeParse({ summarizationMaxTokens: 0 });
    expect(res1.success).toBe(false);
    expect(res2.success).toBe(false);
    const a = makeAgent();
    expect(() => a.setConfig({ summarizationKeepTokens: -1 })).toThrowError();
    expect(() => a.setConfig({ summarizationMaxTokens: 0 })).toThrowError();
  });
});
