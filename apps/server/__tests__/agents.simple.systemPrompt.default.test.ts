import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SimpleAgent, SimpleAgentStaticConfigSchema } from '../src/agents/simple.agent';

class MockConfigService { openaiApiKey = 'sk-test'; }
class MockLoggerService { info = vi.fn(); debug = vi.fn(); error = vi.fn(); }
class MockCheckpointerService { getCheckpointer = vi.fn(() => ({} as any)); }

describe('SimpleAgent systemPrompt defaults behavior', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const makeAgentWithSpies = () => {
    const agent = new SimpleAgent(new MockConfigService() as any, new MockLoggerService() as any, new MockCheckpointerService() as any, 'agent-sp');
    // Spy on internal callModelNode
    const anyA: any = agent as any;
    anyA.callModelNode = { setSystemPrompt: vi.fn(), addTool: vi.fn(), removeTool: vi.fn() };
    return { agent, anyA };
  };

  it('applies schema default on first empty setConfig({})', () => {
    const { agent, anyA } = makeAgentWithSpies();
    const defaultPrompt = SimpleAgentStaticConfigSchema.parse({}).systemPrompt;
    agent.setConfig({});
    expect(anyA.callModelNode.setSystemPrompt).toHaveBeenCalledTimes(1);
    expect(anyA.callModelNode.setSystemPrompt).toHaveBeenCalledWith(defaultPrompt);
  });

  it('does not re-apply or clear default when later config omits systemPrompt', () => {
    const { agent, anyA } = makeAgentWithSpies();
    const defaultPrompt = SimpleAgentStaticConfigSchema.parse({}).systemPrompt;
    agent.setConfig({});
    expect(anyA.callModelNode.setSystemPrompt).toHaveBeenCalledWith(defaultPrompt);
    // Later update without systemPrompt should not call setSystemPrompt again
    agent.setConfig({ model: 'x' } as any);
    expect(anyA.callModelNode.setSystemPrompt).toHaveBeenCalledTimes(1);
  });

  it('custom systemPrompt overrides the default when provided', () => {
    const { agent, anyA } = makeAgentWithSpies();
    const defaultPrompt = SimpleAgentStaticConfigSchema.parse({}).systemPrompt;
    agent.setConfig({});
    expect(anyA.callModelNode.setSystemPrompt).toHaveBeenCalledWith(defaultPrompt);
    agent.setConfig({ systemPrompt: 'Custom' });
    expect(anyA.callModelNode.setSystemPrompt).toHaveBeenLastCalledWith('Custom');
    // Subsequent config without systemPrompt should not reapply default
    agent.setConfig({ model: 'y' } as any);
    expect(anyA.callModelNode.setSystemPrompt).toHaveBeenCalledTimes(2);
  });

  it('treats systemPrompt: undefined as omission; applies default on first call', () => {
    const { agent, anyA } = makeAgentWithSpies();
    const defaultPrompt = SimpleAgentStaticConfigSchema.parse({}).systemPrompt;
    // Explicit key with undefined should be treated as omission
    agent.setConfig({ systemPrompt: undefined } as any);
    expect(anyA.callModelNode.setSystemPrompt).toHaveBeenCalledTimes(1);
    expect(anyA.callModelNode.setSystemPrompt).toHaveBeenCalledWith(defaultPrompt);
  });

  it("accepts empty string '' as explicit override and prevents default re-application", () => {
    const { agent, anyA } = makeAgentWithSpies();
    agent.setConfig({ systemPrompt: '' });
    expect(anyA.callModelNode.setSystemPrompt).toHaveBeenCalledTimes(1);
    expect(anyA.callModelNode.setSystemPrompt).toHaveBeenLastCalledWith('');
    // Later omission should not re-apply default since explicit already set
    agent.setConfig({ model: 'z' } as any);
    expect(anyA.callModelNode.setSystemPrompt).toHaveBeenCalledTimes(1);
  });
});
