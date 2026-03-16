import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import { LocalMCPServerNode } from '../src/nodes/mcp/localMcpServer.node';
import { LocalMCPServerTool } from '../src/nodes/mcp/localMcpServer.tool';

describe('LocalMCPServerNode tool filtering and snapshots', () => {
  let server: LocalMCPServerNode;

  const seedTools = () => {
    const toolA = new LocalMCPServerTool('alpha', 'A', z.object({}).strict(), server);
    const toolB = new LocalMCPServerTool('beta', 'B', z.object({}).strict(), server);
    (server as any).toolsCache = [toolA, toolB];
    (server as any).toolsDiscovered = true;
  };

  beforeEach(async () => {
    const envStub = { resolveEnvItems: vi.fn(async () => ({})), resolveProviderEnv: vi.fn(async () => ({})) } as any;
    server = new LocalMCPServerNode(envStub, {} as any);
    (server as any).init({ nodeId: 'node-x' });
    await server.setConfig({ namespace: 'ns' } as any);
    seedTools();
  });

  it('returns namespaced tools when no filter is set', () => {
    const tools = server.listTools();
    expect(tools.map((t) => t.name)).toEqual(['ns_alpha', 'ns_beta']);
  });

  it('applies allow/deny toolFilter rules against raw names', async () => {
    await server.setConfig({
      namespace: 'ns',
      toolFilter: { mode: 'allow', rules: [{ pattern: 'alpha' }] },
    } as any);
    expect(server.listTools().map((t) => t.name)).toEqual(['ns_alpha']);

    await server.setConfig({
      namespace: 'ns',
      toolFilter: { mode: 'deny', rules: [{ pattern: 'beta' }] },
    } as any);
    expect(server.listTools().map((t) => t.name)).toEqual(['ns_alpha']);
  });

  it('snapshots include updatedAt and namespaced tool names', () => {
    const ts = Date.now();
    (server as any).lastToolsUpdatedAt = ts;
    const snapshot = server.getToolsSnapshot();
    expect(snapshot.updatedAt).toBe(ts);
    expect(snapshot.tools.map((tool) => tool.name)).toEqual(['ns_alpha', 'ns_beta']);
  });
});
