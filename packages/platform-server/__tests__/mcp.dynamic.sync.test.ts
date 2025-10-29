import { describe, it, expect, vi, beforeEach } from 'vitest';
// Avoid importing AgentNode to prevent prisma client load in skipped test
class Agent {}
import { LocalMCPServerNode as LocalMCPServer } from '../src/graph/nodes/mcp/localMcpServer.node';
import { LoggerService } from '../src/core/services/logger.service.js';
import { ConfigService } from '../src/core/services/config.service.js';
import type { McpTool, McpServerConfig } from '../src/mcp/types';

// Mocks
class MockLogger extends LoggerService { info=vi.fn(); debug=vi.fn(); error=vi.fn(); }
class MockContainerService { getDocker(){ return {}; } }
class MockConfigService extends ConfigService { constructor(){ super({ openaiApiKey: 'test' } as any); } }
class MockCheckpointerService { constructor(){} getCheckpointer(){ return { get: async ()=>undefined, put: async ()=>undefined } as any; } }

// Minimal mock provider
const mockProvider = { provide: async (id: string) => ({ id: `c-${id}`, stop: async () => {}, remove: async () => {} }) };

describe.skip('MCP dynamic tool enable/disable sync', () => {
  let server: LocalMCPServer;
  let agent: Agent;
  let logger: any;

  beforeEach(async () => {
    logger = new MockLogger();
    server = new LocalMCPServer(new MockContainerService() as any, logger as any, undefined as any, undefined as any, undefined as any);
    (server as any).setContainerProvider(mockProvider as any);
  await server.setConfig({ namespace: 'ns', command: 'cmd' } as any);

    // Stub discovery with two tools
    (server as any).discoverTools = vi.fn(async () => {
      (server as any).toolsCache = [ { name: 'a', description: 'A' }, { name: 'b', description: 'B' } ];
      (server as any).toolsDiscovered = true;
      return (server as any).toolsCache as McpTool[];
    });

    const configService = new MockConfigService();
    const cps = new MockCheckpointerService();
    agent = new Agent(configService as any, logger as any, cps as any, 'agent1');
    await server.provision();
    await agent.addMcpServer(server);
    // Manually emit ready since we bypassed real start events
    (server as any).emitter.emit('ready');
  });

  it('removes disabled tools and adds re-enabled tools', async () => {
    // Initially both tools
    let tools = server.listTools();
    expect(tools.map(t=>t.name).sort()).toEqual(['a','b']);

    // Disable 'b'
    server.setDynamicConfig({ a: true, b: false });
    tools = server.listTools();
    expect(tools.map(t=>t.name)).toEqual(['a']);

    // Re-enable 'b'
    server.setDynamicConfig({ a: true, b: true });
    tools = server.listTools();
    expect(tools.map(t=>t.name).sort()).toEqual(['a','b']);
  });
});
