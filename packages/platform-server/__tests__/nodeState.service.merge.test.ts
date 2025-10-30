import { describe, it, expect } from 'vitest';
import { deepMergeNodeState } from '../src/graph/nodeState.service';

describe('deepMergeNodeState', () => {
  it('retains existing mcp.tools/toolsUpdatedAt and adds enabledTools', () => {
    const prev = { mcp: { tools: [{ name: 'a' }], toolsUpdatedAt: 1 } } as Record<string, unknown>;
    const patch = { mcp: { enabledTools: ['a'] } } as Record<string, unknown>;
    const merged = deepMergeNodeState(prev, patch);
    expect(merged).toEqual({ mcp: { tools: [{ name: 'a' }], toolsUpdatedAt: 1, enabledTools: ['a'] } });
  });

  it('retains existing mcp.enabledTools and adds tools/toolsUpdatedAt', () => {
    const prev = { mcp: { enabledTools: ['a'] } } as Record<string, unknown>;
    const patch = { mcp: { tools: [{ name: 'a' }], toolsUpdatedAt: 1 } } as Record<string, unknown>;
    const merged = deepMergeNodeState(prev, patch);
    expect(merged).toEqual({ mcp: { enabledTools: ['a'], tools: [{ name: 'a' }], toolsUpdatedAt: 1 } });
  });
});
