import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalMCPServerNode } from '../src/nodes/mcp/localMcpServer.node';

class MockLogger { info=vi.fn(); debug=vi.fn(); error=vi.fn(); }
class MockContainerService { getDocker(){ return {}; } }

describe('LocalMCPServerNode listTools filtering by enabledTools', () => {
  let server: LocalMCPServerNode;
  let logger: any;

  beforeEach(async () => {
    logger = new MockLogger();
    const nodeStateService = { getSnapshot: vi.fn((_id: string) => ({ mcp: { enabledTools: [] } })) } as any;
    const moduleRef = { get: vi.fn(() => nodeStateService) } as any;
    const envStub = { resolveEnvItems: vi.fn(), resolveProviderEnv: vi.fn() } as any;
    server = new LocalMCPServerNode(new MockContainerService() as any, logger as any, envStub, {} as any, moduleRef as any);
    // Manually init nodeId since we are not running through runtime
    (server as any).init({ nodeId: 'node-1' });
    await server.setConfig({ namespace: 'ns' } as any);
    // Preload two tools into cache
    (server as any).preloadCachedTools([
      { name: 'a', description: 'A', inputSchema: { type: 'object' } },
      { name: 'b', description: 'B', inputSchema: { type: 'object' } },
    ], Date.now());
  });

  it('returns [] when enabledTools=[]', () => {
    // enabledTools is [] from beforeEach
    const tools = server.listTools();
    expect(tools.length).toBe(0);
  });

  it('returns only enabled tool when enabledTools=["ns_a"]', () => {
    // Update snapshot to include only ns_a
    const ns = { getSnapshot: vi.fn((_id: string) => ({ mcp: { enabledTools: ['ns_a'] } })) } as any;
    (server as any).nodeStateService = ns;
    const tools = server.listTools();
    expect(tools.map(t => t.name)).toEqual(['ns_a']);
  });
});

describe('LocalMCPServerNode setState enabledTools emits mcp.tools_updated', () => {
  it('emits on hook invocation', async () => {
    const logger = new MockLogger();
    const envStub = { resolveEnvItems: vi.fn(), resolveProviderEnv: vi.fn() } as any;
    const server = new LocalMCPServerNode(new MockContainerService() as any, logger as any, envStub, {} as any, undefined as any);
    // Preload one tool for payload consistency
    (server as any).preloadCachedTools([{ name: 'x', description: 'X', inputSchema: { type: 'object' } }], Date.now());
    let fired = false;
    (server as any).on('mcp.tools_updated', (_payload: { tools: unknown[]; updatedAt: number }) => { fired = true; });
    await server.setState({ mcp: { tools: [], toolsUpdatedAt: Date.now(), enabledTools: ['ns_x'] } as any });
    expect(fired).toBe(true);
  });
});
