import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { LocalMCPServerNode } from '../src/nodes/mcp/localMcpServer.node';
import { LocalMCPServerTool } from '../src/nodes/mcp/localMcpServer.tool';

class MockLogger {
  info = vi.fn();
  debug = vi.fn();
  error = vi.fn();
}

describe('LocalMCPServerNode tool filtering', () => {
  let server: LocalMCPServerNode;

  beforeEach(async () => {
    const envStub = { resolveEnvItems: vi.fn(), resolveProviderEnv: vi.fn() } as any;
    server = new LocalMCPServerNode(envStub, {} as any);
    (server as any).logger = new MockLogger();
    (server as any).init({ nodeId: 'node-1' });
    await server.setConfig({ namespace: 'ns' } as any);
    (server as any).toolsCache = [
      new LocalMCPServerTool('alpha', 'A', z.object({}).strict(), server),
      new LocalMCPServerTool('beta', 'B', z.object({}).strict(), server),
    ];
  });

  it('returns all tools when no filter is set', () => {
    const tools = server.listTools();
    expect(tools.map((t) => t.name)).toEqual(['ns_alpha', 'ns_beta']);
  });

  it('filters tools using allow rules', async () => {
    await server.setConfig({
      namespace: 'ns',
      toolFilter: { mode: 'allow', rules: [{ pattern: 'beta' }] },
    } as any);
    const tools = server.listTools();
    expect(tools.map((t) => t.name)).toEqual(['ns_beta']);
  });
});

describe('LocalMCPServerNode config updates emit tools_updated', () => {
  it('emits on setConfig changes', async () => {
    const logger = new MockLogger();
    const envStub = { resolveEnvItems: vi.fn(), resolveProviderEnv: vi.fn() } as any;
    const server = new LocalMCPServerNode(envStub, {} as any);
    (server as any).logger = logger;
    (server as any).toolsCache = [new LocalMCPServerTool('x', 'X', z.object({}).strict(), server)];

    let fired: { tools: unknown[]; updatedAt: number } | null = null;
    server.on('mcp.tools_updated', (payload: { tools: unknown[]; updatedAt: number }) => {
      fired = payload;
    });

    await server.setConfig({ namespace: 'ns' } as any);
    expect(fired).toBeTruthy();
    expect(Array.isArray(fired?.tools)).toBe(true);
    expect(typeof fired?.updatedAt).toBe('number');
  });
});
