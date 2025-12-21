import { describe, it, expect, beforeEach } from 'vitest';
import { LocalMCPServerNode } from '../src/nodes/mcp/localMcpServer.node';
import { createModuleRefStub } from './helpers/module-ref.stub';
import { WorkspaceProviderStub, WorkspaceNodeStub } from './helpers/workspace-provider.stub';

describe('LocalMCPServer preload + staleness + persist', () => {
  let server: LocalMCPServerNode;
  let lastUpdate: { tools: any[]; updatedAt: number } | null = null;

  beforeEach(async () => {
    const envStub = { resolveEnvItems: async () => ({}), resolveProviderEnv: async () => ({}) } as any;
    server = new LocalMCPServerNode(envStub, {} as any, createModuleRefStub());
    await server.setConfig({ namespace: 'x', command: 'echo' } as any);
    const provider = new WorkspaceProviderStub();
    const workspaceNode = new WorkspaceNodeStub(provider);
    (server as any).setContainerProvider(workspaceNode);
    (server as any).on('mcp.tools_updated', (p: { tools: any[]; updatedAt: number }) => { lastUpdate = p; });
  });

  it('preloads cached tools and persists after discovery', async () => {
    // Preload
    (server as any).preloadCachedTools([{ name: 'cached', description: 'd', inputSchema: { type: 'object' } } as any], Date.now() - 1000);
    // Force discovery by marking stale
    await server.setConfig({ namespace: 'x', command: 'echo', staleTimeoutMs: 1 } as any);
    // Stub discoverTools to avoid docker
    (server as any).discoverTools = async function() { (this as any).preloadCachedTools([{ name: 'fresh', description: 'd', inputSchema: { type: 'object' } }], Date.now()); return (this as any).listTools(); };
    await (server as any).provision();
    await server.setState({ mcp: { enabledTools: ['fresh'] } as any });
    const tools = server.listTools();
    expect(tools.find((t) => String(t.name).endsWith('_fresh'))).toBeTruthy();
    expect(typeof lastUpdate?.updatedAt).toBe('number');
  });
});
