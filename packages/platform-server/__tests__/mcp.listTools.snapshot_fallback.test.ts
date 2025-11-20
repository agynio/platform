import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalMCPServerNode } from '../src/nodes/mcp/localMcpServer.node';

class MockLogger { info=vi.fn(); debug=vi.fn(); error=vi.fn(); }
class MockContainerService { getDocker(){ return {}; } }

describe('LocalMCPServerNode listTools: snapshot-first, fallback-to-setState, namespacing', () => {
  let server: LocalMCPServerNode;
  let logger: any;

  beforeEach(async () => {
    logger = new MockLogger();
    const nodeStateService = { getSnapshot: vi.fn((_id: string) => undefined) } as any; // snapshot not ready
    const envStub = { resolveEnvItems: vi.fn(), resolveProviderEnv: vi.fn() } as any;
    server = new LocalMCPServerNode(new MockContainerService() as any, logger as any, envStub, {} as any, nodeStateService as any);
    (server as any).init({ nodeId: 'node-x' });
    await server.setConfig({ namespace: 'ns' } as any);
    // Preload two tools into cache
    (server as any).preloadCachedTools([
      { name: 'a', description: 'A', inputSchema: { type: 'object' } },
      { name: 'b', description: 'B', inputSchema: { type: 'object' } },
    ], Date.now());
  });

  it('falls back to setState enabledTools when snapshot is undefined', async () => {
    // setState provides enabledTools including unknown raw 'c'
    await server.setState({ mcp: { enabledTools: ['a', 'c'] } as any });
    const tools = server.listTools();
    // should include namespaced runtime name for raw 'a' only
    expect(tools.map(t => t.name)).toEqual(['ns_a']);
    // unknown logged as info
    expect((logger.info as any).mock.calls.find((c: any[]) => String(c[0]).includes('unknown tool'))).toBeTruthy();
  });

  it('accepts raw names from snapshot and maps to runtime namespaced form', async () => {
    const ns = { getSnapshot: vi.fn((_id: string) => ({ mcp: { enabledTools: ['a'] } })) } as any;
    (server as any).nodeStateService = ns;
    const tools = server.listTools();
    expect(tools.map(t => t.name)).toEqual(['ns_a']);
  });
});
