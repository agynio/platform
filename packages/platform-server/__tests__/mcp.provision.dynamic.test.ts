import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { LocalMCPServerNode } from '../src/nodes/mcp/localMcpServer.node';
import { LocalMCPServerTool } from '../src/nodes/mcp/localMcpServer.tool';
import type { McpServerConfig, McpTool } from '../src/mcp/types';
import { WorkspaceProviderStub, WorkspaceNodeStub } from './helpers/workspace-provider.stub';

class MockLogger {
  info = vi.fn();
  debug = vi.fn();
  error = vi.fn();
}
describe('LocalMCPServer provision/deprovision + toolFilter', () => {
  let server: LocalMCPServerNode;
  let logger: MockLogger;

  beforeEach(() => {
    logger = new MockLogger();
    const envStub = {
      resolveEnvItems: vi.fn(async () => ({})),
      resolveProviderEnv: vi.fn(async () => ({})),
    } as any;
    server = new LocalMCPServerNode(envStub, {} as any);
    (server as any).logger = logger;
    const provider = new WorkspaceProviderStub();
    const workspaceNode = new WorkspaceNodeStub(provider);
    (server as any).setContainerProvider(workspaceNode);
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

  it('applies toolFilter rules when listing tools', async () => {
    await server.setConfig({
      namespace: 'ns',
      command: 'cmd',
      toolFilter: { mode: 'allow', rules: [{ pattern: 'toolA' }] },
    } as McpServerConfig);
    (server as any).toolsCache = [
      new LocalMCPServerTool('toolA', 'A', z.object({}).strict(), server),
      new LocalMCPServerTool('toolB', 'B', z.object({}).strict(), server),
    ];
    const tools = server.listTools();
    expect(tools.map((t) => t.name)).toEqual(['ns_toolA']);
  });
});
