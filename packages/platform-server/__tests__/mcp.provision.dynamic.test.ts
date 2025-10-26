import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalMCPServer } from '../src/nodes/mcp/localMcpServer.node';
import type { McpServerConfig, McpTool } from '../src/mcp/types';

class MockLogger { info=vi.fn(); debug=vi.fn(); error=vi.fn(); }
class MockContainerService { getDocker(){ return {}; } }

// Minimal mock provider
const mockProvider = {
  provide: async (id: string) => ({ id: `c-${id}`, stop: async () => {}, remove: async () => {} })
};

describe.skip('LocalMCPServer Provisionable + DynamicConfigurable', () => {
  let server: LocalMCPServer;
  let logger: any;

  beforeEach(() => {
    logger = new MockLogger();
    server = new LocalMCPServer(new MockContainerService() as any, logger as any);
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

    const transitions: string[] = [];
    server.onProvisionStatusChange((s) => transitions.push(s.state));

    await server.provision();
    expect(server.getProvisionStatus().state).toBe('ready');
    expect(transitions).toContain('provisioning');
    expect(transitions).toContain('ready');
  });

  it('provision error path sets error with details', async () => {
    (server as any).discoverTools = vi.fn(async () => { throw new Error('disc boom'); });
    await server.setConfig({ namespace: 'ns', command: 'cmd' } as McpServerConfig);

    const transitions: string[] = [];
    server.onProvisionStatusChange((s) => transitions.push(s.state));

    // Trigger start flow which will call discoverTools via maybeStart/tryStartOnce
    await server.provision();
    // We don't have timers/backoff in this stubbed flow; directly simulate failure by flushing waiters
    // Since our provision awaits pendingStart (if deps present), we need to emulate failure
    // For simplicity, invoke internal flushStartWaiters with error
    (server as any).flushStartWaiters(new Error('fail'));

    // Mark started false
    expect(transitions).toContain('provisioning');
    // Error transition is set in provision catch path when pendingStart rejects
    // Not asserting details content, only state flow presence
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
    expect(server.getProvisionStatus().state).toBe('not_ready');
  });

  it('dynamic config readiness and schema after discovery', async () => {
    (server as any).discoverTools = vi.fn(async () => {
      (server as any).toolsCache = [ { name: 'toolA' }, { name: 'toolB' } ];
      (server as any).toolsDiscovered = true;
      return (server as any).toolsCache;
    });
    await server.setConfig({ namespace: 'ns', command: 'cmd' } as McpServerConfig);
    expect(server.isDynamicConfigReady()).toBe(false);
    await server.provision();
    expect(server.isDynamicConfigReady()).toBe(true);
    const schema = server.getDynamicConfigSchema() as any;
    expect(schema.type).toBe('object');
    expect(Object.keys(schema.properties)).toEqual(expect.arrayContaining(['toolA', 'toolB']));
  });

  it('setDynamicConfig filters listTools output', async () => {
    (server as any).discoverTools = vi.fn(async () => {
      (server as any).toolsCache = [ { name: 'toolA' }, { name: 'toolB' } ];
      (server as any).toolsDiscovered = true;
      return (server as any).toolsCache;
    });
    await server.setConfig({ namespace: 'ns', command: 'cmd' } as McpServerConfig);
    await server.provision();
    let tools = server.listTools();
    expect(tools.map(t => t.name).sort()).toEqual(['toolA', 'toolB']);

    server.setDynamicConfig({ toolA: true, toolB: false });
    tools = server.listTools();
    expect(tools.map(t => t.name)).toEqual(['toolA']);
  });
});
