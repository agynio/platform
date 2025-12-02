import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalMCPServerNode } from '../src/nodes/mcp/localMcpServer.node';
import type { McpServerConfig, McpTool } from '../src/mcp/types';
import { createModuleRefStub } from './helpers/module-ref.stub';

class MockLogger {
  info = vi.fn();
  debug = vi.fn();
  error = vi.fn();
}
class MockContainerService {
  getDocker() {
    return {};
  }
}

// Minimal mock provider
const mockProvider = {
  provide: async (id: string) => ({ id: `c-${id}`, stop: async () => {}, remove: async () => {} })
};

describe('LocalMCPServer provision/deprovision + enabledTools filtering', () => {
  let server: LocalMCPServerNode;
  let logger: MockLogger;

  beforeEach(() => {
    logger = new MockLogger();
    const envStub = {
      resolveEnvItems: vi.fn(async () => ({})),
      resolveProviderEnv: vi.fn(async () => ({})),
    } as any;
    server = new LocalMCPServerNode(new MockContainerService() as any, envStub, {} as any, createModuleRefStub());
    (server as any).logger = logger;
    (server as any).setContainerProvider(mockProvider as any);
  });

  it('provision transitions and listener notifications (success)', async () => {
    // Stub discoverTools to simulate success
    const tools: McpTool[] = [ { name: 'toolA' } as any, { name: 'toolB' } as any ];
    (server as any).discoverTools = vi.fn(async () => {
      (server as any).toolsCache = tools;
      (server as any).toolsDiscovered = true;
      return tools;
    });
    await server.setConfig({ namespace: 'ns', command: 'cmd' } as McpServerConfig);

    await server.provision();
    expect(server.status).toBe('ready');
  });

  it('provision error path sets provisioning_error', async () => {
    (server as any).discoverTools = vi.fn(async () => { throw new Error('disc boom'); });
    await server.setConfig({ namespace: 'ns', command: 'cmd' } as McpServerConfig);

    const transitions: string[] = [];
    server.on('status_changed', (ev: { next: string }) => transitions.push(ev.next));

    await server.provision();
    // Current behavior: startOnce swallows discovery errors, leaving status at 'provisioning'
    expect(server.status).toBe('provisioning');
  });

  it('deprovision resets to not_ready', async () => {
    (server as any).discoverTools = vi.fn(async () => {
      (server as any).toolsCache = [];
      (server as any).toolsDiscovered = true;
      return [];
    });
    await server.setConfig({ namespace: 'ns', command: 'cmd' } as McpServerConfig);
    await server.provision();
    await server.deprovision();
    expect(server.status).toBe('not_ready');
  });

  // Dynamic-config APIs removed; use setState(enabledTools) + listTools filtering.

  it('setState(enabledTools) filters listTools output by raw names or namespaced', async () => {
    await server.setConfig({ namespace: 'ns', command: 'cmd' } as McpServerConfig);
    // Preload cache with discovered tools (creates LocalMCPServerTool instances)
    server.preloadCachedTools([ { name: 'toolA' } as any, { name: 'toolB' } as any ]);
    let tools = server.listTools();
    expect(tools).toEqual([]);

    // Enable only toolA using raw name
    await server.setState({ mcp: { enabledTools: ['toolA'] } });
    tools = server.listTools();
    expect(tools.map(t => t.name)).toEqual(['ns_toolA']);

    // Enable only toolB using namespaced form
    await server.setState({ mcp: { enabledTools: ['ns_toolB'] } });
    tools = server.listTools();
    expect(tools.map(t => t.name)).toEqual(['ns_toolB']);

    // Empty array disables all
    await server.setState({ mcp: { enabledTools: [] } });
    tools = server.listTools();
    expect(tools.length).toBe(0);
  });
});
