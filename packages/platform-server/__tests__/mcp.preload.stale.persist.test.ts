import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { LocalMCPServerNode } from '../src/nodes/mcp/localMcpServer.node';
import { LocalMCPServerTool } from '../src/nodes/mcp/localMcpServer.tool';
import { WorkspaceProviderStub, WorkspaceNodeStub } from './helpers/workspace-provider.stub';

describe('LocalMCPServer preload + staleness + persist', () => {
  let server: LocalMCPServerNode;
  let lastUpdate: { tools: any[]; updatedAt: number } | null = null;

  beforeEach(async () => {
    const envStub = { resolveEnvItems: async () => ({}), resolveProviderEnv: async () => ({}) } as any;
    server = new LocalMCPServerNode(envStub, {} as any);
    await server.setConfig({ namespace: 'x', command: 'echo' } as any);
    const provider = new WorkspaceProviderStub();
    const workspaceNode = new WorkspaceNodeStub(provider);
    (server as any).setContainerProvider(workspaceNode);
    (server as any).on('mcp.tools_updated', (p: { tools: any[]; updatedAt: number }) => { lastUpdate = p; });
  });

  it('refreshes stale tools during provisioning', async () => {
    const cached = new LocalMCPServerTool('cached', 'd', z.object({}).strict(), server);
    (server as any).toolsCache = [cached];
    (server as any).toolsDiscovered = true;
    (server as any).lastToolsUpdatedAt = Date.now() - 1000;

    await server.setConfig({ namespace: 'x', command: 'echo', staleTimeoutMs: 1 } as any);
    lastUpdate = null;

    (server as any).discoverTools = async function () {
      const fresh = new LocalMCPServerTool('fresh', 'd', z.object({}).strict(), this);
      (this as any).toolsCache = [fresh];
      (this as any).toolsDiscovered = true;
      const ts = Date.now();
      (this as any).lastToolsUpdatedAt = ts;
      (this as any).notifyToolsUpdated(ts);
      return (this as any).listTools();
    };

    await server.provision();
    const tools = server.listTools();
    expect(tools.map((t) => t.name)).toEqual(['x_fresh']);
    expect(lastUpdate?.tools.map((tool: { name: string }) => tool.name)).toEqual(['x_fresh']);
    expect(typeof lastUpdate?.updatedAt).toBe('number');
  });
});
